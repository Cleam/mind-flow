import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Post,
  Query,
  Request,
  Response,
  Sse,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Observable } from 'rxjs';
import { SkipWrapResponse } from '../common/decorators/skip-wrap-response.decorator.js';
import { RequestTimeout } from '../common/decorators/request-timeout.decorator.js';
import { AskDto } from './dto/ask.dto.js';
import { AskWithSessionDto } from './dto/ask-with-session.dto.js';
import { ChatAnswerDto } from './dto/chat-answer.dto.js';
import { ChatHistoryQueryDto } from './dto/chat-history-query.dto.js';
import { ChatHistoryResponseDto } from './dto/chat-history-response.dto.js';
import { ChatSessionDto } from './dto/chat-session.dto.js';
import { StreamBodyDto } from './dto/stream-body.dto.js';
import { StreamQueryDto } from './dto/stream-query.dto.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * 单轮问答接口：适用于不需要会话记忆的场景。
   */
  @Post('ask')
  @RequestTimeout(180_000)
  async ask(@Body() body: AskDto): Promise<ChatAnswerDto> {
    return this.chatService.ask(body);
  }

  /**
   * 创建会话：返回可复用的 sessionId，供多轮问答与历史查询使用。
   */
  @Post('sessions')
  @RequestTimeout(30_000)
  createSession(): ChatSessionDto {
    return this.chatService.createSession();
  }

  /**
   * 查询会话历史：支持 limit/offset 分页。
   */
  @Get('history')
  @RequestTimeout(60_000)
  async history(
    @Query() query: ChatHistoryQueryDto,
  ): Promise<ChatHistoryResponseDto> {
    return this.chatService.getHistory(query);
  }

  /**
   * SSE GET 版本流式问答：将 query 参数适配为统一的 AskWithSessionDto。
   */
  @Sse('stream')
  @SkipWrapResponse()
  @RequestTimeout(180_000)
  stream(@Query() query: StreamQueryDto): Observable<MessageEvent> {
    // 统一 body 结构，确保 GET/POST 两种流式入口复用同一 service 逻辑。
    const body: AskWithSessionDto = {
      sessionId: query.sessionId,
      question: query.question,
      topK: query.topK,
      threshold: query.threshold,
    };
    return this.chatService.askWithHistoryStream(body);
  }

  /**
   * SSE POST 版本流式问答：手动写响应头并将 Observable 事件转为 SSE 文本帧。
   */
  @Post('stream')
  @SkipWrapResponse()
  @RequestTimeout(180_000)
  streamByPost(
    @Body() body: StreamBodyDto,
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    // 显式设置 SSE 相关响应头，避免代理层缓存/缓冲导致流式失效。
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const streamBody: AskWithSessionDto = {
      sessionId: body.sessionId,
      question: body.question,
      topK: body.topK,
      threshold: body.threshold,
    };

    // 订阅服务层事件流并写入响应；完成时关闭连接。
    const subscription = this.chatService
      .askWithHistoryStream(streamBody)
      .subscribe({
        next: (event) => {
          res.write(this.toSseMessage(event));
        },
        complete: () => {
          res.end();
        },
      });

    // 客户端断开时立即取消订阅，防止服务端继续无效计算。
    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  /**
   * 将 MessageEvent 编码为标准 SSE 格式：event/data + 双换行分帧。
   */
  private toSseMessage(event: MessageEvent): string {
    const chunks: string[] = [];

    if (event.type) {
      chunks.push(`event: ${event.type}`);
    }

    const payload = JSON.stringify(event.data ?? null);
    chunks.push(`data: ${payload}`);

    return `${chunks.join('\n')}\n\n`;
  }
}
