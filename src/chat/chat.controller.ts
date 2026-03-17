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
import { StreamBodyDto } from './dto/stream-body.dto.js';
import { StreamQueryDto } from './dto/stream-query.dto.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('ask')
  @RequestTimeout(180_000)
  async ask(@Body() body: AskDto): Promise<ChatAnswerDto> {
    return this.chatService.ask(body);
  }

  @Get('history')
  @RequestTimeout(60_000)
  async history(
    @Query() query: ChatHistoryQueryDto,
  ): Promise<ChatHistoryResponseDto> {
    return this.chatService.getHistory(query);
  }

  @Sse('stream')
  @SkipWrapResponse()
  @RequestTimeout(180_000)
  stream(@Query() query: StreamQueryDto): Observable<MessageEvent> {
    const body: AskWithSessionDto = {
      sessionId: query.sessionId,
      question: query.question,
      topK: query.topK,
      threshold: query.threshold,
    };
    return this.chatService.askWithHistoryStream(body);
  }

  @Post('stream')
  @SkipWrapResponse()
  @RequestTimeout(180_000)
  streamByPost(
    @Body() body: StreamBodyDto,
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
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

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

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
