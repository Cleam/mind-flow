import { BaseLlmProvider } from '../base/base-llm-provider.js';
import { LlmProviderConfig } from '../base/llm-provider.interface.js';

/**
 * Ollama 本地模型 Provider
 */
export class OllamaLlmProvider extends BaseLlmProvider {
  private static readonly DEFAULT_BASE_URL = 'http://localhost:11434';
  private static readonly DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
  private static readonly DEFAULT_RERANK_MODEL = 'bge-reranker-base';

  getName(): string {
    return 'Ollama';
  }

  async embed(text: string): Promise<number[]> {
    this.validateText(text);

    const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        prompt: text,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const details = await response.text();
      this.handleHttpError(this.getName(), response.status, details);
    }

    const data = (await response.json()) as {
      embedding?: number[];
    };

    const embedding = data.embedding;
    this.validateEmbedding(embedding);
    return embedding;
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    // Ollama 暂不支持批量，降级为串行
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  async rerank(
    query: string,
    documents: string[],
  ): Promise<Array<{ index: number; score: number; document: string }>> {
    this.validateText(query);

    if (!documents.length) {
      return [];
    }

    // Ollama Rerank 需要特定模型支持，这里使用简化实现
    // 实际可调用 Ollama 的 generate 接口做基于生成的重排
    const scores = await Promise.all(
      documents.map(async (doc, index) => {
        // 使用向量相似度作为重排分数
        try {
          const [queryEmb, docEmb] = await Promise.all([
            this.embed(query),
            this.embed(doc),
          ]);
          const similarity = this.cosineSimilarity(queryEmb, docEmb);
          return { index, score: similarity, document: doc };
        } catch {
          return { index, score: 0, document: doc };
        }
      }),
    );

    return scores.sort((a, b) => b.score - a.score);
  }

  protected mergeWithDefaults(
    config: LlmProviderConfig,
  ): Required<LlmProviderConfig> {
    return {
      apiKey: config.apiKey || '', // Ollama 本地不需要 API Key
      baseUrl: config.baseUrl || OllamaLlmProvider.DEFAULT_BASE_URL,
      embeddingModel:
        config.embeddingModel || OllamaLlmProvider.DEFAULT_EMBEDDING_MODEL,
      rerankModel: config.rerankModel || OllamaLlmProvider.DEFAULT_RERANK_MODEL,
      timeout: config.timeout || BaseLlmProvider.DEFAULT_TIMEOUT,
    };
  }

  protected validateConfig(): void {
    // Ollama 本地模式无需 API Key 校验
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
