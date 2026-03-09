import { Injectable } from '@nestjs/common';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';

@Injectable()
export class EmbeddingService {
  private readonly provider: LlmProvider;

  constructor(providerFactory: LlmProviderFactory) {
    this.provider = providerFactory.createProvider();
  }

  async embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  /**
   * 批量向量化
   */
  async batchEmbed(texts: string[]): Promise<number[][]> {
    return this.provider.batchEmbed(texts);
  }
}
