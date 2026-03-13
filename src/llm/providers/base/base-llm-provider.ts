import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LlmProvider, LlmProviderConfig } from './llm-provider.interface.js';

/**
 * LLM Provider 抽象基类
 * 提供通用逻辑和默认实现
 */
export abstract class BaseLlmProvider implements LlmProvider {
  protected static readonly EMBEDDING_DIMENSION = 1536;
  protected static readonly DEFAULT_TIMEOUT = 30000;

  protected readonly config: Required<LlmProviderConfig>;

  constructor(config: LlmProviderConfig) {
    this.config = this.mergeWithDefaults(config);
    this.validateConfig();
  }

  abstract getName(): string;
  abstract embed(text: string): Promise<number[]>;
  abstract rerank(
    query: string,
    documents: string[],
  ): Promise<Array<{ index: number; score: number; document: string }>>;
  abstract generate(prompt: string): Promise<string>;

  /**
   * 默认批量向量化实现（串行调用 embed）
   * 子类可以覆盖以提供更高效的批量实现
   */
  async batchEmbed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  /**
   * 默认可用性检查
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 简单检查：尝试向量化一个短文本
      await this.embed('test');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证文本输入
   */
  protected validateText(text: string): void {
    if (!text || !text.trim()) {
      throw new BadRequestException('文本不能为空');
    }
  }

  /**
   * 验证向量维度
   */
  protected validateEmbedding(
    embedding: number[] | undefined,
    providerName?: string,
  ): asserts embedding is number[] {
    const name = providerName || this.getName();

    if (!embedding) {
      throw new InternalServerErrorException(`${name} 返回的向量为空`);
    }

    if (embedding.length !== BaseLlmProvider.EMBEDDING_DIMENSION) {
      throw new InternalServerErrorException(
        `${name} 向量维度不正确，期望 ${BaseLlmProvider.EMBEDDING_DIMENSION}，实际 ${embedding.length}`,
      );
    }
  }

  /**
   * 合并配置与默认值
   */
  protected abstract mergeWithDefaults(
    config: LlmProviderConfig,
  ): Required<LlmProviderConfig>;

  /**
   * 验证配置
   */
  protected abstract validateConfig(): void;

  /**
   * 通用 HTTP 错误处理
   */
  protected handleHttpError(
    providerName: string,
    status: number,
    details: string,
  ): never {
    throw new InternalServerErrorException(
      `${providerName} 请求失败，status=${status}，details=${details}`,
    );
  }
}
