export class RerankResultItemDto {
  /** 文档在输入数组中的原始索引 */
  index: number;
  /** 重排得分，数值越大越相关 */
  score: number;
  /** 重排后的文档正文 */
  document: string;

  constructor(partial: Partial<RerankResultItemDto>) {
    this.index = partial.index ?? 0;
    this.score = partial.score ?? 0;
    this.document = partial.document ?? '';
  }
}

export class RerankResultDto {
  /** 重排使用的查询文本 */
  query: string;
  /** 重排结果列表（已按相关性排序） */
  results: RerankResultItemDto[];

  constructor(query: string, results: RerankResultItemDto[]) {
    this.query = query;
    this.results = results;
  }
}
