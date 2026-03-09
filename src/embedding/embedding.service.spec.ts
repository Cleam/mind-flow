import { BadRequestException } from '@nestjs/common';
import { EmbeddingService } from './embedding.service.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { MockLlmProvider } from '../llm/providers/mock/mock-llm-provider.js';
import { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';

describe('EmbeddingService', () => {
  it('should return deterministic mock embedding with fixed dimension', async () => {
    const mockFactory: LlmProviderFactory = {
      createProvider: (): LlmProvider => new MockLlmProvider({}),
    } as LlmProviderFactory;

    const service = new EmbeddingService(mockFactory);

    const embedding1 = await service.embed('same text');
    const embedding2 = await service.embed('same text');

    expect(embedding1).toHaveLength(1536);
    expect(embedding2).toHaveLength(1536);
    expect(embedding1).toEqual(embedding2);
  });

  it('should throw for empty text', async () => {
    const mockFactory: LlmProviderFactory = {
      createProvider: (): LlmProvider => new MockLlmProvider({}),
    } as LlmProviderFactory;

    const service = new EmbeddingService(mockFactory);

    await expect(service.embed('   ')).rejects.toThrow('文本不能为空');
    await expect(service.embed('   ')).rejects.toThrow(BadRequestException);
  });

  it('should support batch embedding', async () => {
    const mockFactory: LlmProviderFactory = {
      createProvider: (): LlmProvider => new MockLlmProvider({}),
    } as LlmProviderFactory;

    const service = new EmbeddingService(mockFactory);

    const embeddings = await service.batchEmbed(['text1', 'text2', 'text3']);

    expect(embeddings).toHaveLength(3);
    expect(embeddings[0]).toHaveLength(1536);
    expect(embeddings[1]).toHaveLength(1536);
    expect(embeddings[2]).toHaveLength(1536);
  });
});
