import { BaseLlmProvider } from '../base/base-llm-provider.js';
import { LlmProviderConfig } from '../base/llm-provider.interface.js';

/**
 * 阿里云百炼 Qwen Provider
 * 兼容 OpenAI 协议
 */
export class QwenLlmProvider extends BaseLlmProvider {
  private static readonly DEFAULT_BASE_URL =
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  private static readonly DEFAULT_EMBEDDING_MODEL = 'text-embedding-v3';
  private static readonly DEFAULT_RERANK_MODEL = 'gte-rerank';

  getName(): string {
    return 'Qwen';
  }

  async embed(text: string): Promise<number[]> {
    this.validateText(text);

    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: text,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const details = await response.text();
      this.handleHttpError(this.getName(), response.status, details);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = data.data?.[0]?.embedding;
    this.validateEmbedding(embedding);
    return embedding;
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: texts,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const details = await response.text();
      this.handleHttpError(this.getName(), response.status, details);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    if (!data.data || data.data.length !== texts.length) {
      throw new Error('批量向量化返回数量不匹配');
    }

    return data.data.map((item, index) => {
      const embedding = item.embedding;
      this.validateEmbedding(embedding, `${this.getName()}[${index}]`);
      return embedding;
    });
  }

  async rerank(
    query: string,
    documents: string[],
  ): Promise<Array<{ index: number; score: number; document: string }>> {
    this.validateText(query);

    if (!documents.length) {
      return [];
    }

    // Qwen Rerank API (兼容 OpenAI 格式的扩展)
    const response = await fetch(`${this.config.baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.rerankModel,
        query,
        documents,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const details = await response.text();
      this.handleHttpError(this.getName(), response.status, details);
    }

    const data = (await response.json()) as {
      results?: Array<{ index: number; relevance_score: number }>;
    };

    if (!data.results) {
      throw new Error('Rerank 返回格式错误');
    }

    return data.results.map((result) => ({
      index: result.index,
      score: result.relevance_score,
      document: documents[result.index] || '',
    }));
  }

  protected mergeWithDefaults(
    config: LlmProviderConfig,
  ): Required<LlmProviderConfig> {
    return {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || QwenLlmProvider.DEFAULT_BASE_URL,
      embeddingModel:
        config.embeddingModel || QwenLlmProvider.DEFAULT_EMBEDDING_MODEL,
      rerankModel: config.rerankModel || QwenLlmProvider.DEFAULT_RERANK_MODEL,
      timeout: config.timeout || BaseLlmProvider.DEFAULT_TIMEOUT,
    };
  }

  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('Qwen Provider 缺少 API Key');
    }
  }
}
