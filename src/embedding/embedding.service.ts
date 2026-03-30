import { Injectable } from '@nestjs/common';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';

@Injectable()
export class EmbeddingService {
  private readonly provider: LlmProvider;

  constructor(providerFactory: LlmProviderFactory) {
    this.provider = providerFactory.createProvider();
  }

  /**
   * 单条文本向量化。
   * 该服务只做 provider 代理，统一上层调用入口，避免业务层依赖具体 provider。
   */
  async embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  /**
   * 批量向量化。
   * 用于降低多条文本逐条调用的网络开销，保持与 provider 能力一致。
   */
  async batchEmbed(texts: string[]): Promise<number[][]> {
    return this.provider.batchEmbed(texts);
  }
}
