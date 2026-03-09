export class RerankResultItemDto {
  index: number;
  score: number;
  document: string;

  constructor(partial: Partial<RerankResultItemDto>) {
    this.index = partial.index ?? 0;
    this.score = partial.score ?? 0;
    this.document = partial.document ?? '';
  }
}

export class RerankResultDto {
  query: string;
  results: RerankResultItemDto[];

  constructor(query: string, results: RerankResultItemDto[]) {
    this.query = query;
    this.results = results;
  }
}
