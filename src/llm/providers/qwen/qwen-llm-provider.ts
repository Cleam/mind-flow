import { BaseLlmProvider } from '../base/base-llm-provider.js';
import { LlmProviderConfig } from '../base/llm-provider.interface.js';

/**
 * 阿里云百炼 Qwen Provider
 * 兼容 OpenAI 协议
 */
export class QwenLlmProvider extends BaseLlmProvider {
  private static readonly DEFAULT_BASE_URL =
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  private static readonly DEFAULT_EMBEDDING_MODEL = 'text-embedding-v4';
  private static readonly DEFAULT_RERANK_MODEL = 'gte-rerank';
  private static readonly DEFAULT_CHAT_MODEL = 'qwen-plus';

  private static readonly OPENAI_COMPATIBLE_EMBEDDING_MODELS = [
    'text-embedding-v4',
    'text-embedding-v3',
    'text-embedding-v2',
    'text-embedding-v1',
  ] as const;

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
        dimensions: QwenLlmProvider.EMBEDDING_DIMENSION,
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
        dimensions: QwenLlmProvider.EMBEDDING_DIMENSION,
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

  async generate(prompt: string): Promise<string> {
    this.validateText(prompt);

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.chatModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const details = await response.text();
      this.handleHttpError(this.getName(), response.status, details);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = data.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      throw new Error('Qwen 生成返回为空');
    }

    return answer;
  }

  async *generateStream(
    prompt: string,
    abortSignal?: AbortSignal,
  ): AsyncIterable<string> {
    this.validateText(prompt);

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.chatModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        stream: true,
      }),
      signal: abortSignal || AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const details = await response.text();
      this.handleHttpError(this.getName(), response.status, details);
    }

    if (!response.body) {
      throw new Error('Qwen 流式响应体为空');
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';

    while (true) {
      if (abortSignal?.aborted) {
        return;
      }

      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const token = this.parseOpenAiCompatibleToken(line);
        if (token === null) {
          continue;
        }
        yield token;
      }
    }

    const tail = decoder.decode();
    if (tail) {
      const lines = `${buffer}${tail}`.split('\n');
      for (const line of lines) {
        const token = this.parseOpenAiCompatibleToken(line);
        if (token === null) {
          continue;
        }
        yield token;
      }
    }
  }

  private parseOpenAiCompatibleToken(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return null;
    }

    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      return null;
    }

    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = parsed.choices?.[0]?.delta?.content;
      return typeof content === 'string' ? content : null;
    } catch {
      return null;
    }
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
      chatModel: config.chatModel || QwenLlmProvider.DEFAULT_CHAT_MODEL,
      timeout: config.timeout || BaseLlmProvider.DEFAULT_TIMEOUT,
    };
  }

  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('Qwen Provider 缺少 API Key');
    }

    // 如果使用的是 OpenAI 兼容模式 baseUrl，校验 embedding 模型
    if (
      this.config.baseUrl?.includes('compatible-mode') &&
      !QwenLlmProvider.OPENAI_COMPATIBLE_EMBEDDING_MODELS.includes(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.config.embeddingModel as any,
      )
    ) {
      throw new Error(
        `OpenAI 兼容模式下不支持 embedding 模型: ${this.config.embeddingModel}，` +
          `请使用: ${QwenLlmProvider.OPENAI_COMPATIBLE_EMBEDDING_MODELS.join(', ')}`,
      );
    }
  }
}
