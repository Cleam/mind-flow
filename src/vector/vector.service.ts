import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
      INSERT INTO "DocumentChunk" ("content", "metadata", "embedding")
      VALUES (${content}, ${metadataLiteral}::jsonb, ${vectorLiteral}::vector)
    `;
  }
}
