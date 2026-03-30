import { Injectable, type MessageEvent } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, type Subscriber } from 'rxjs';
import { BusinessException } from '../common/exceptions/business.exception.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { RerankService } from '../rerank/rerank.service.js';
import { VectorService } from '../vector/vector.service.js';
import { AppLoggerService } from '../logger/logger.service.js';
import { ChatAnswerDto } from './dto/chat-answer.dto.js';
import { ChatHistoryItemDto } from './dto/chat-history-item.dto.js';
import { ChatHistoryResponseDto } from './dto/chat-history-response.dto.js';
import { ChatSessionDto } from './dto/chat-session.dto.js';
import { ChatSourceDto } from './dto/chat-source.dto.js';
import { ConversationService } from './conversation.service.js';
import { PromptService } from './prompt.service.js';
import { QueryRewriteService } from './query-rewrite.service.js';
import type { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';
import type { SearchChunkResult } from '../vector/vector.service.js';
import type { AskDto } from './dto/ask.dto.js';
import type { AskWithSessionDto } from './dto/ask-with-session.dto.js';
import type { ChatHistoryQueryDto } from './dto/chat-history-query.dto.js';

@Injectable()
export class ChatService {
  private readonly provider: LlmProvider;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorService: VectorService,
    private readonly rerankService: RerankService,
    private readonly promptService: PromptService,
    private readonly conversationService: ConversationService,
    private readonly queryRewriteService: QueryRewriteService,
    private readonly logger: AppLoggerService,
    providerFactory: LlmProviderFactory,
  ) {
    this.provider = providerFactory.createProvider();
  }

  /**
   * 单轮问答入口：不使用会话历史，只基于当前问题做检索与生成。
   */
  async ask(body: AskDto): Promise<ChatAnswerDto> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;
    return this.askInternal(body.question, body.question, topK, threshold);
  }

  /**
   * 创建会话 ID，格式包含日期与随机串，便于追踪与避免碰撞。
   */
  createSession(): ChatSessionDto {
    const createdAt = new Date().toISOString();
    const sessionId = `sess_${createdAt.slice(0, 10).replace(/-/g, '')}_${randomUUID().replace(/-/g, '')}`;

    return new ChatSessionDto({
      sessionId,
      createdAt,
    });
  }

  /**
   * 多轮问答入口：先改写查询，再写入用户消息，最后生成回答并持久化助手消息。
   */
  async askWithHistory(body: AskWithSessionDto): Promise<ChatAnswerDto> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;

    // 只取最近窗口，兼顾改写效果与性能，避免历史无限膨胀。
    const history = await this.conversationService.getHistory(
      body.sessionId,
      6,
      0,
    );
    // 改写仅用于检索，原问题仍保留给最终回答展示语义。
    const rewriteQuery = await this.queryRewriteService.rewrite(
      body.question,
      history,
    );

    // 先落用户消息，再执行主流程，保证异常场景下会话时间线完整。
    await this.conversationService.saveMessage(
      body.sessionId,
      'user',
      body.question,
    );

    const answer = await this.askInternal(
      body.question,
      rewriteQuery,
      topK,
      threshold,
    );

    await this.conversationService.saveMessage(
      body.sessionId,
      'assistant',
      answer.answer,
    );

    return answer;
  }

  /**
   * 分页读取会话历史，并转换成 API 响应 DTO。
   */
  getHistory(query: ChatHistoryQueryDto): Promise<ChatHistoryResponseDto> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    // Service 层返回内部模型，这里统一映射为 API DTO，隔离领域对象结构。
    return this.conversationService
      .getHistory(query.sessionId, limit, offset)
      .then(
        (items) =>
          new ChatHistoryResponseDto({
            sessionId: query.sessionId,
            limit,
            offset,
            items: items.map((item) => new ChatHistoryItemDto(item)),
          }),
      );
  }

  /**
   * 多轮问答流式入口：创建可取消的流并复用统一处理函数。
   */
  askWithHistoryStream(body: AskWithSessionDto): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const abortController = new AbortController();

      // 用 void 明确忽略 Promise 链返回值，错误在 runStream 内部统一处理。
      void this.runStream(body, subscriber, abortController.signal);

      return () => {
        // Observable 取消时同步触发 AbortSignal，终止 provider 流式生成。
        abortController.abort();
      };
    });
  }

  /**
   * 执行流式问答主流程：检索阶段与生成阶段分别回传事件，异常统一转换为 error 事件。
   */
  private async runStream(
    body: AskWithSessionDto,
    subscriber: Subscriber<MessageEvent>,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;

    try {
      // 先改写后检索，提升多轮场景中的指代消解效果。
      const history = await this.conversationService.getHistory(
        body.sessionId,
        6,
        0,
      );
      const rewriteQuery = await this.queryRewriteService.rewrite(
        body.question,
        history,
      );

      await this.conversationService.saveMessage(
        body.sessionId,
        'user',
        body.question,
      );

      subscriber.next({
        type: 'meta',
        data: { stage: 'retrieval_start', rewriteQuery },
      });

      const context = await this.prepareAnswerContext(
        body.question,
        rewriteQuery,
        topK,
        threshold,
      );

      // 无可用上下文时直接返回兜底答案，避免继续调用生成模型。
      if (!context.rankedChunks.length) {
        const doneData = {
          answer: '不了解',
          sources: [] as ChatSourceDto[],
          rewriteQuery,
        };
        subscriber.next({ type: 'done', data: doneData });
        await this.conversationService.saveMessage(
          body.sessionId,
          'assistant',
          doneData.answer,
        );
        subscriber.complete();
        return;
      }

      subscriber.next({
        type: 'meta',
        data: {
          stage: 'retrieval_done',
          rewriteQuery,
          count: context.rankedChunks.length,
        },
      });
      subscriber.next({ type: 'meta', data: { stage: 'generation_start' } });

      let answer = '';
      for await (const token of this.provider.generateStream(
        context.prompt,
        abortSignal,
      )) {
        // 连接断开或客户端取消时，尽快停止后续 token 推送。
        if (abortSignal.aborted) {
          subscriber.complete();
          return;
        }

        answer += token;
        subscriber.next({
          type: 'token',
          data: {
            token,
          },
        });
      }

      const safeAnswer = answer.trim() || '不了解';
      // source 从重排结果构造，确保分值与引用来源一致。
      const sources = this.buildSources(context.rankedChunks);
      await this.conversationService.saveMessage(
        body.sessionId,
        'assistant',
        safeAnswer,
      );

      subscriber.next({
        type: 'done',
        data: { answer: safeAnswer, sources, rewriteQuery },
      });
      subscriber.complete();
    } catch (error: unknown) {
      // 用户主动取消不应上报 error 事件，直接结束流即可。
      if (abortSignal.aborted) {
        subscriber.complete();
        return;
      }

      const message = this.pickErrorMessage(error);
      this.logger.error('Chat stream failed', {
        provider: this.provider.getName(),
        sessionId: body.sessionId,
        questionPreview: body.question.slice(0, 200),
        questionLength: body.question.length,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      subscriber.next({ type: 'error', data: { message } });
      subscriber.complete();
    }
  }

  /**
   * 非流式问答执行：复用统一检索上下文，失败时抛出业务异常供上层处理。
   */
  private async askInternal(
    question: string,
    retrievalQuery: string,
    topK: number,
    threshold: number,
  ): Promise<ChatAnswerDto> {
    const context = await this.prepareAnswerContext(
      question,
      retrievalQuery,
      topK,
      threshold,
    );

    // 检索为空时不调用生成模型，直接返回兜底答案降低延迟与成本。
    if (!context.rankedChunks.length) {
      return new ChatAnswerDto({
        answer: '不了解',
        sources: [],
      });
    }

    let answer = '不了解';
    try {
      answer = await this.provider.generate(context.prompt);
    } catch (error: unknown) {
      // 生成失败统一转为业务异常码，避免上游感知 provider 实现细节。
      this.logger.error('Chat ask generation failed', {
        provider: this.provider.getName(),
        questionPreview: question.slice(0, 200),
        questionLength: question.length,
        topK,
        threshold,
        retrievedCount: context.retrieved.length,
        rerankedCount: context.rankedChunks.length,
        promptLength: context.prompt.length,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new BusinessException('INTERNAL_ERROR', 'LLM 回答生成失败');
    }

    const sources = this.buildSources(context.rankedChunks);
    return new ChatAnswerDto({ answer, sources });
  }

  /**
   * 构建回答所需上下文：查询向量化 -> 向量检索 -> 重排 -> Prompt 组装。
   */
  private async prepareAnswerContext(
    question: string,
    retrievalQuery: string,
    topK: number,
    threshold: number,
  ): Promise<{
    retrieved: SearchChunkResult[];
    rankedChunks: SearchChunkResult[];
    prompt: string;
  }> {
    let queryEmbedding: number[];
    try {
      // 检索 query 使用改写结果，回答 query 使用原问题，两者职责分离。
      queryEmbedding = await this.embeddingService.embed(retrievalQuery);
    } catch (error: unknown) {
      this.logger.error('Chat ask embedding failed', {
        provider: this.provider.getName(),
        questionPreview: question.slice(0, 200),
        questionLength: question.length,
        retrievalQueryPreview: retrievalQuery.slice(0, 200),
        topK,
        threshold,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new BusinessException('INTERNAL_ERROR', '查询向量化失败');
    }

    let retrieved: SearchChunkResult[];
    try {
      // topK/threshold 在向量层会再次做边界收敛，这里保持语义参数透传。
      retrieved = await this.vectorService.search(
        queryEmbedding,
        topK,
        threshold,
      );
    } catch (error: unknown) {
      this.logger.error('Chat ask vector search failed', {
        provider: this.provider.getName(),
        questionPreview: question.slice(0, 200),
        questionLength: question.length,
        retrievalQueryPreview: retrievalQuery.slice(0, 200),
        topK,
        threshold,
        embeddingDim: queryEmbedding.length,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new BusinessException('INTERNAL_ERROR', '向量检索失败');
    }

    // 重排失败会在 tryRerank 内降级，确保上下文构建尽量不中断。
    const rankedChunks = await this.tryRerank(question, retrieved, topK);
    // Prompt 仅传必要字段，避免把原始 metadata 全量暴露给模型。
    const prompt = this.promptService.generatePrompt(
      question,
      rankedChunks.map((chunk) => ({
        content: chunk.content,
        source: this.pickSource(chunk.metadata),
        score: chunk.score,
      })),
    );

    return { retrieved, rankedChunks, prompt };
  }

  /**
   * 将检索片段转换为对外 source 结构，保证字段稳定。
   */
  private buildSources(rankedChunks: SearchChunkResult[]): ChatSourceDto[] {
    // source/chunkIndex 统一经 helper 提取，避免 metadata 脏数据影响响应结构。
    return rankedChunks.map(
      (chunk) =>
        new ChatSourceDto({
          chunkId: chunk.id.toString(),
          source: this.pickSource(chunk.metadata),
          score: chunk.score,
          chunkIndex: this.pickChunkIndex(chunk.metadata),
        }),
    );
  }

  /**
   * 统一提取可展示错误信息，避免将内部异常细节直接暴露给调用方。
   */
  private pickErrorMessage(error: unknown): string {
    if (error instanceof BusinessException) {
      return error.message;
    }

    if (error instanceof Error && error.message?.trim()) {
      return error.message;
    }

    return '请求处理失败';
  }

  /**
   * 尝试重排检索结果；若重排服务失败，降级为原检索结果的前 topK。
   */
  private async tryRerank(
    question: string,
    retrieved: SearchChunkResult[],
    topK: number,
  ): Promise<SearchChunkResult[]> {
    const documents = retrieved.map((chunk) => chunk.content);

    try {
      const reranked = await this.rerankService.rerank(
        question,
        documents,
        topK,
      );

      const rankedChunks: SearchChunkResult[] = [];
      for (const item of reranked) {
        const chunk = retrieved[item.index];
        // 防御式处理：忽略越界索引，避免 provider 异常结果污染输出。
        if (!chunk) {
          continue;
        }

        rankedChunks.push({
          ...chunk,
          score: item.score,
        });
      }

      return rankedChunks;
    } catch {
      // 重排失败不影响主流程可用性，保持检索兜底输出。
      return retrieved.slice(0, topK);
    }
  }

  /**
   * 从 metadata 提取 source，缺失或非法时统一回退为 unknown。
   */
  private pickSource(metadata: Record<string, unknown>): string {
    const value = metadata.source;
    return typeof value === 'string' && value.trim() ? value : 'unknown';
  }

  /**
   * 从 metadata 提取 chunkIndex，缺失或类型不匹配时返回 -1。
   */
  private pickChunkIndex(metadata: Record<string, unknown>): number {
    const value = metadata.chunkIndex;
    return typeof value === 'number' ? value : -1;
  }
}
