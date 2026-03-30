import { BusinessException } from '../common/exceptions/business.exception.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';
import { SearchChunkResult } from '../vector/vector.service.js';
import { AskDto } from './dto/ask.dto.js';
import { ChatService } from './chat.service.js';
import { PromptService } from './prompt.service.js';

describe('ChatService', () => {
  const validEmbedding = Array.from({ length: 1536 }, () => 0.123);

  function createService(options?: {
    retrieved?: SearchChunkResult[];
    rerankThrows?: boolean;
    embeddingThrows?: boolean;
    generatedAnswer?: string;
  }): ChatService {
    const retrieved = options?.retrieved ?? [
      {
        id: 1n,
        content: 'A',
        metadata: { source: 'doc-a', chunkIndex: 0 },
        score: 0.7,
      },
      {
        id: 2n,
        content: 'B',
        metadata: { source: 'doc-b', chunkIndex: 1 },
        score: 0.6,
      },
    ];

    const provider: LlmProvider = {
      getName: () => 'Test',
      embed: () => Promise.resolve(validEmbedding),
      batchEmbed: () => Promise.resolve([validEmbedding]),
      rerank: () => Promise.resolve([]),
      generate: () => Promise.resolve(options?.generatedAnswer ?? '生成答案'),
      // eslint-disable-next-line @typescript-eslint/require-await
      generateStream: async function* () {
        yield options?.generatedAnswer ?? '生成答案';
      },
      isAvailable: () => Promise.resolve(true),
    };

    const providerFactory: LlmProviderFactory = {
      createProvider: () => provider,
    } as LlmProviderFactory;

    const embeddingService = {
      embed: (): Promise<number[]> => {
        if (options?.embeddingThrows) {
          return Promise.reject(new Error('embedding failed'));
        }
        return Promise.resolve(validEmbedding);
      },
    };

    const vectorService = {
      search: () => Promise.resolve(retrieved),
    };

    const rerankService = {
      rerank: () => {
        if (options?.rerankThrows) {
          return Promise.reject(new Error('rerank failed'));
        }

        return Promise.resolve([
          { index: 1, score: 0.99, document: 'B' },
          { index: 0, score: 0.5, document: 'A' },
        ]);
      },
    };

    const conversationService = {
      getHistory: () => Promise.resolve([]),
      saveMessage: () => Promise.resolve(),
    };

    const queryRewriteService = {
      rewrite: (_question: string) => Promise.resolve(_question),
    };

    return new ChatService(
      embeddingService as never,
      vectorService as never,
      rerankService as never,
      new PromptService(),
      conversationService as never,
      queryRewriteService as never,
      { error: () => undefined } as never,
      providerFactory,
    );
  }

  it('should return answer and reordered sources', async () => {
    const service = createService();
    const body: AskDto = { question: 'test question' };

    const result = await service.ask(body);

    expect(result.answer).toBe('生成答案');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].chunkId).toBe('2');
    expect(result.sources[0].source).toBe('doc-b');
  });

  it('should return 不了解 with empty sources when no retrieval result', async () => {
    const service = createService({ retrieved: [] });
    const result = await service.ask({ question: 'unknown' });

    expect(result.answer).toBe('不了解');
    expect(result.sources).toEqual([]);
  });

  it('should fallback to retrieval order when rerank fails', async () => {
    const service = createService({ rerankThrows: true });
    const result = await service.ask({ question: 'test question' });

    expect(result.sources[0].chunkId).toBe('1');
    expect(result.sources[1].chunkId).toBe('2');
  });

  it('should throw business exception when embedding fails', async () => {
    const service = createService({ embeddingThrows: true });

    await expect(service.ask({ question: 'test question' })).rejects.toThrow(
      BusinessException,
    );
  });
});
