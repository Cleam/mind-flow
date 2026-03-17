import { BaseLlmProvider } from '../base/base-llm-provider.js';
import { LlmProviderConfig } from '../base/llm-provider.interface.js';

/**
 * Mock Provider 用于测试和本地开发
 */
export class MockLlmProvider extends BaseLlmProvider {
  getName(): string {
    return 'Mock';
  }

  embed(text: string): Promise<number[]> {
    this.validateText(text);
    return Promise.resolve(this.deterministicEmbedding(text));
  }

  batchEmbed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(
      texts.map((text) => this.deterministicEmbedding(text)),
    );
  }

  rerank(
    query: string,
    documents: string[],
  ): Promise<Array<{ index: number; score: number; document: string }>> {
    this.validateText(query);

    // 基于文本长度模拟相关性分数
    return Promise.resolve(
      documents
        .map((doc, index) => ({
          index,
          score: this.mockRelevanceScore(query, doc),
          document: doc,
        }))
        .sort((a, b) => b.score - a.score),
    );
  }

  generate(prompt: string): Promise<string> {
    this.validateText(prompt);

    if (prompt.includes('【参考资料】') && prompt.includes('（无）')) {
      return Promise.resolve('不了解');
    }

    return Promise.resolve('根据参考资料，这是一个 Mock 回答。');
  }

  async *generateStream(
    prompt: string,
    abortSignal?: AbortSignal,
  ): AsyncIterable<string> {
    const answer = await this.generate(prompt);
    const chunks = answer.match(/.{1,6}/g) || [answer];

    for (const chunk of chunks) {
      if (abortSignal?.aborted) {
        return;
      }
      yield chunk;
    }
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true); // Mock 总是可用
  }

  protected mergeWithDefaults(
    config: LlmProviderConfig,
  ): Required<LlmProviderConfig> {
    return {
      apiKey: config.apiKey || 'mock-key',
      baseUrl: config.baseUrl || 'http://localhost:0',
      embeddingModel: config.embeddingModel || 'mock-embedding',
      rerankModel: config.rerankModel || 'mock-rerank',
      chatModel: config.chatModel || 'mock-chat',
      timeout: config.timeout || BaseLlmProvider.DEFAULT_TIMEOUT,
    };
  }

  protected validateConfig(): void {
    // Mock 无需验证配置
  }

  /**
   * 确定性向量生成（与原 EmbeddingService.mockEmbedding 逻辑一致）
   */
  private deterministicEmbedding(text: string): number[] {
    let seed = 0;
    for (const char of text) {
      seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    }

    return Array.from({ length: BaseLlmProvider.EMBEDDING_DIMENSION }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return Number((seed / 4294967296).toFixed(6));
    });
  }

  /**
   * 模拟相关性分数（基于文本特征）
   */
  private mockRelevanceScore(query: string, document: string): number {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const docWords = document.toLowerCase().split(/\s+/);

    // 计算重叠词比例
    const overlap = docWords.filter((word) => queryWords.has(word)).length;
    return overlap / Math.max(queryWords.size, 1);
  }
}
