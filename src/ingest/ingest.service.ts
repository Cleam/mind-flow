import { Injectable } from '@nestjs/common';
import { VectorService } from '../vector/vector.service.js';

@Injectable()
export class IngestService {
  private static readonly EMBEDDING_DIMENSION = 1536;

  constructor(private readonly vectorService: VectorService) {}

  async testIngest(texts: string[]): Promise<{ insertedCount: number }> {
    for (const [index, text] of texts.entries()) {
      const embedding = this.mockEmbedding();
      await this.vectorService.saveChunk(
        text,
        {
          source: 'test-ingest',
          chunkIndex: index,
        },
        embedding,
      );
    }

    return { insertedCount: texts.length };
  }

  private mockEmbedding(): number[] {
    return Array.from({ length: IngestService.EMBEDDING_DIMENSION }, () =>
      Number(Math.random().toFixed(6)),
    );
  }
}
