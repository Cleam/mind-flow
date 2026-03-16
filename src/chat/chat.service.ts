import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business.exception.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { RerankService } from '../rerank/rerank.service.js';
import { VectorService } from '../vector/vector.service.js';
import { AppLoggerService } from '../logger/logger.service.js';
import { ChatAnswerDto } from './dto/chat-answer.dto.js';
import { ChatSourceDto } from './dto/chat-source.dto.js';
import { PromptService } from './prompt.service.js';
import type { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';
import type { SearchChunkResult } from '../vector/vector.service.js';
import type { AskDto } from './dto/ask.dto.js';

@Injectable()
export class ChatService {
  private readonly provider: LlmProvider;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorService: VectorService,
    private readonly rerankService: RerankService,
    private readonly promptService: PromptService,
    private readonly logger: AppLoggerService,
    providerFactory: LlmProviderFactory,
  ) {
    this.provider = providerFactory.createProvider();
  }

  async ask(body: AskDto): Promise<ChatAnswerDto> {
    const topK = body.topK ?? 3;
    const threshold = body.threshold ?? 0.5;

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingService.embed(body.question);
    } catch (error: unknown) {
      this.logger.error('Chat ask embedding failed', {
        provider: this.provider.getName(),
        questionPreview: body.question.slice(0, 200),
        questionLength: body.question.length,
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
        questionPreview: body.question.slice(0, 200),
        questionLength: body.question.length,
        topK,
        threshold,
        embeddingDim: queryEmbedding.length,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new BusinessException('INTERNAL_ERROR', '向量检索失败');
    }

    if (!retrieved.length) {
      return new ChatAnswerDto({
        answer: '不了解',
        sources: [],
      });
    }

    const rankedChunks = await this.tryRerank(body.question, retrieved, topK);
    const prompt = this.promptService.generatePrompt(
      body.question,
      rankedChunks.map((chunk) => ({
        content: chunk.content,
        source: this.pickSource(chunk.metadata),
        score: chunk.score,
      })),
    );

    let answer = '不了解';
    try {
      answer = await this.provider.generate(prompt);
    } catch (error: unknown) {
      this.logger.error('Chat ask generation failed', {
        provider: this.provider.getName(),
        questionPreview: body.question.slice(0, 200),
        questionLength: body.question.length,
        topK,
        threshold,
        retrievedCount: retrieved.length,
        rerankedCount: rankedChunks.length,
        promptLength: prompt.length,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new BusinessException('INTERNAL_ERROR', 'LLM 回答生成失败');
    }

    const sources = rankedChunks.map(
      (chunk) =>
        new ChatSourceDto({
          chunkId: chunk.id.toString(),
          source: this.pickSource(chunk.metadata),
          score: chunk.score,
          chunkIndex: this.pickChunkIndex(chunk.metadata),
        }),
    );

    return new ChatAnswerDto({ answer, sources });
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
