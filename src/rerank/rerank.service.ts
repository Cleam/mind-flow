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
   * 重排文档：基于 query 对候选文档重新打分并排序。
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

    // topK 在服务层截断，避免上层重复处理数组边界。
    const limitedResults = topK ? results.slice(0, topK) : results;

    // 统一映射为 DTO，隔离 provider 返回结构差异。
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
