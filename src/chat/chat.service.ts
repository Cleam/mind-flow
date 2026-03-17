import { Injectable, type MessageEvent } from '@nestjs/common';
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

  async ask(body: AskDto): Promise<ChatAnswerDto> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;
    return this.askInternal(body.question, body.question, topK, threshold);
  }

  async askWithHistory(body: AskWithSessionDto): Promise<ChatAnswerDto> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;

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

  getHistory(query: ChatHistoryQueryDto): Promise<ChatHistoryResponseDto> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

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

  askWithHistoryStream(body: AskWithSessionDto): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const abortController = new AbortController();

      void this.runStream(body, subscriber, abortController.signal);

      return () => {
        abortController.abort();
      };
    });
  }

  private async runStream(
    body: AskWithSessionDto,
    subscriber: Subscriber<MessageEvent>,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;

    try {
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

    const rankedChunks = await this.tryRerank(question, retrieved, topK);
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

  private buildSources(rankedChunks: SearchChunkResult[]): ChatSourceDto[] {
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

  private pickErrorMessage(error: unknown): string {
    if (error instanceof BusinessException) {
      return error.message;
    }

    if (error instanceof Error && error.message?.trim()) {
      return error.message;
    }

    return '请求处理失败';
  }

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
      return retrieved.slice(0, topK);
    }
  }

  private pickSource(metadata: Record<string, unknown>): string {
    const value = metadata.source;
    return typeof value === 'string' && value.trim() ? value : 'unknown';
  }

  private pickChunkIndex(metadata: Record<string, unknown>): number {
    const value = metadata.chunkIndex;
    return typeof value === 'number' ? value : -1;
  }
}
