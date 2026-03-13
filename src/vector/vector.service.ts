import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SearchChunkResult {
  id: bigint;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

@Injectable()
export class VectorService {
  private static readonly EMBEDDING_DIMENSION = 1536;

  constructor(private readonly prisma: PrismaService) {}

  async saveChunk(
    content: string,
    metadata: Record<string, unknown>,
    embedding: number[],
  ): Promise<void> {
    if (embedding.length !== VectorService.EMBEDDING_DIMENSION) {
      throw new BadRequestException(
        `embedding 维度必须是 ${VectorService.EMBEDDING_DIMENSION}`,
      );
    }

    const vectorLiteral = `[${embedding.join(',')}]`;
    const metadataLiteral = JSON.stringify(metadata);

    await this.prisma.$executeRaw`
      INSERT INTO "document_chunks" ("content", "metadata", "embedding")
      VALUES (${content}, ${metadataLiteral}::jsonb, ${vectorLiteral}::vector)
    `;
  }

  async search(
    embedding: number[],
    limit = 3,
    threshold = 0.5,
  ): Promise<SearchChunkResult[]> {
    if (embedding.length !== VectorService.EMBEDDING_DIMENSION) {
      throw new BadRequestException(
        `embedding 维度必须是 ${VectorService.EMBEDDING_DIMENSION}`,
      );
    }

    const safeLimit = Math.max(1, Math.trunc(limit));
    const safeThreshold = Math.min(1, Math.max(0, threshold));
    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows = await this.prisma.$queryRaw<SearchChunkResult[]>`
      SELECT
        "id",
        "content",
        "metadata",
        1 - ("embedding" <=> ${vectorLiteral}::vector) AS "score"
      FROM "document_chunks"
      WHERE 1 - ("embedding" <=> ${vectorLiteral}::vector) >= ${safeThreshold}
      ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${safeLimit}
    `;

    return rows;
  }
}
