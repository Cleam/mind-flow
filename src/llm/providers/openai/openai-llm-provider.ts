import { BaseLlmProvider } from '../base/base-llm-provider.js';
import { LlmProviderConfig } from '../base/llm-provider.interface.js';

/**
 * OpenAI Provider
 */
export class OpenAILlmProvider extends BaseLlmProvider {
  private static readonly DEFAULT_BASE_URL = 'https://api.openai.com/v1';
  private static readonly DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
  private static readonly DEFAULT_RERANK_MODEL = 'rerank-v1'; // 占位，OpenAI 暂无官方 rerank
  private static readonly DEFAULT_CHAT_MODEL = 'gpt-4o-mini';

  getName(): string {
    return 'OpenAI';
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

  rerank(
    query: string,
    documents: string[],
  ): Promise<Array<{ index: number; score: number; document: string }>> {
    this.validateText(query);

    // OpenAI 官方暂无 Rerank API，这里使用降级策略：返回原顺序
    // 实际生产环境可集成第三方 Rerank 服务（如 Cohere）
    return Promise.resolve(
      documents.map((doc, index) => ({
        index,
        score: 1.0 - index * 0.01, // 模拟递减分数
        document: doc,
      })),
    );
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
      throw new Error('OpenAI 生成返回为空');
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
      throw new Error('OpenAI 流式响应体为空');
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
        const token = this.parseOpenAiToken(line);
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
        const token = this.parseOpenAiToken(line);
        if (token === null) {
          continue;
        }
        yield token;
      }
    }
  }

  private parseOpenAiToken(line: string): string | null {
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
      baseUrl: config.baseUrl || OpenAILlmProvider.DEFAULT_BASE_URL,
      embeddingModel:
        config.embeddingModel || OpenAILlmProvider.DEFAULT_EMBEDDING_MODEL,
      rerankModel: config.rerankModel || OpenAILlmProvider.DEFAULT_RERANK_MODEL,
      chatModel: config.chatModel || OpenAILlmProvider.DEFAULT_CHAT_MODEL,
      timeout: config.timeout || BaseLlmProvider.DEFAULT_TIMEOUT,
    };
  }

  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('OpenAI Provider 缺少 API Key');
    }
  }
}
