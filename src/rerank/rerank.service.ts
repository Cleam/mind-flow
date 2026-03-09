import { Injectable } from '@nestjs/common';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';
import { RerankResultItemDto } from './dto/rerank-result.dto.js';

@Injectable()
export class RerankService {
  private readonly provider: LlmProvider;

  constructor(providerFactory: LlmProviderFactory) {
    this.provider = providerFactory.createProvider();
  }

  /**
   * 重排文档
   * @param query 查询文本
   * @param documents 待重排文档列表
   * @param topK 返回前 K 个结果（可选）
   */
  async rerank(
    query: string,
    documents: string[],
    topK?: number,
  ): Promise<RerankResultItemDto[]> {
    const results = await this.provider.rerank(query, documents);

    // 如果指定了 topK，则截取前 K 个结果
    const limitedResults = topK ? results.slice(0, topK) : results;

    return limitedResults.map(
      (item) =>
        new RerankResultItemDto({
          index: item.index,
          score: item.score,
          document: item.document,
        }),
    );
  }
}
