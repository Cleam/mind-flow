import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './providers/base/llm-provider.interface.js';
import { MockLlmProvider } from './providers/mock/mock-llm-provider.js';
import { QwenLlmProvider } from './providers/qwen/qwen-llm-provider.js';
import { OpenAILlmProvider } from './providers/openai/openai-llm-provider.js';
import { OllamaLlmProvider } from './providers/ollama/ollama-llm-provider.js';

/**
 * LLM Provider 工厂
 * 根据配置自动选择和实例化合适的 Provider
 */
@Injectable()
export class LlmProviderFactory {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 创建 Provider 实例
   */
  createProvider(): LlmProvider {
    const provider = this.configService.get<string>(
      'EMBEDDING_PROVIDER',
      'mock',
    );

    switch (provider.toLowerCase()) {
      case 'qwen':
        return new QwenLlmProvider({
          apiKey: this.configService.get<string>('QWEN_API_KEY'),
          baseUrl: this.configService.get<string>('QWEN_BASE_URL'),
          embeddingModel: this.configService.get<string>(
            'QWEN_EMBEDDING_MODEL',
          ),
          rerankModel: this.configService.get<string>('QWEN_RERANK_MODEL'),
          chatModel: this.configService.get<string>('QWEN_CHAT_MODEL'),
        });

      case 'openai':
        return new OpenAILlmProvider({
          apiKey: this.configService.get<string>('OPENAI_API_KEY'),
          baseUrl: this.configService.get<string>('OPENAI_BASE_URL'),
          embeddingModel: this.configService.get<string>(
            'OPENAI_EMBEDDING_MODEL',
          ),
          rerankModel: this.configService.get<string>('OPENAI_RERANK_MODEL'),
          chatModel: this.configService.get<string>('OPENAI_CHAT_MODEL'),
        });

      case 'ollama':
        return new OllamaLlmProvider({
          baseUrl: this.configService.get<string>('OLLAMA_BASE_URL'),
          embeddingModel: this.configService.get<string>(
            'OLLAMA_EMBEDDING_MODEL',
          ),
          rerankModel: this.configService.get<string>('OLLAMA_RERANK_MODEL'),
          chatModel: this.configService.get<string>('OLLAMA_CHAT_MODEL'),
        });

      case 'mock':
      default:
        return new MockLlmProvider({});
    }
  }
}
