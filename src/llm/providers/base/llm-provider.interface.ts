/**
 * LLM Provider 策略接口
 * 定义所有 LLM 提供商需要实现的核心能力
 */
export interface LlmProvider {
  /**
   * 获取 Provider 名称
   */
  getName(): string;

  /**
   * 文本向量化（Embedding）
   * @param text 待向量化的文本
   * @returns 1536 维向量数组
   */
  embed(text: string): Promise<number[]>;

  /**
   * 批量文本向量化
   * @param texts 待向量化的文本数组
   * @returns 向量数组的数组
   */
  batchEmbed(texts: string[]): Promise<number[][]>;

  /**
   * 语义重排（Rerank）
   * @param query 查询文本
   * @param documents 待重排的文档数组
   * @returns 重排后的文档索引及分数
   */
  rerank(
    query: string,
    documents: string[],
  ): Promise<Array<{ index: number; score: number; document: string }>>;

  /**
   * 文本生成
   * @param prompt 完整提示词
   * @returns 生成结果
   */
  generate(prompt: string): Promise<string>;

  /**
   * 检查 Provider 是否可用（API Key、网络等）
   */
  isAvailable(): Promise<boolean>;
}

/**
 * LLM Provider 配置
 */
export interface LlmProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  embeddingModel?: string;
  rerankModel?: string;
  chatModel?: string;
  timeout?: number;
}
