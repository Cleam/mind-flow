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

  /**
   * 写入单个向量片段。
   * 先做维度守卫，再通过 pgvector 原始 SQL 落库。
   */
  async saveChunk(
    content: string,
    metadata: Record<string, unknown>,
    embedding: number[],
  ): Promise<void> {
    // 与 schema 中 vector(1536) 保持一致，避免运行期插入失败。
    if (embedding.length !== VectorService.EMBEDDING_DIMENSION) {
      throw new BadRequestException(
        `embedding 维度必须是 ${VectorService.EMBEDDING_DIMENSION}`,
      );
    }

    // pgvector 接收形如 "[0.1,0.2,...]" 的字面量格式。
    const vectorLiteral = `[${embedding.join(',')}]`;
    const metadataLiteral = JSON.stringify(metadata);

    // 使用模板参数可避免 SQL 注入，同时保留向量类型转换能力。
    await this.prisma.$executeRaw`
      INSERT INTO "document_chunks" ("content", "metadata", "embedding")
      VALUES (${content}, ${metadataLiteral}::jsonb, ${vectorLiteral}::vector)
    `;
  }

  /**
   * 向量检索：返回相似度 >= threshold 的 topK 片段。
   */
  async search(
    embedding: number[],
    limit = 3,
    threshold = 0.5,
  ): Promise<SearchChunkResult[]> {
    // 检索前做同样的维度校验，防止 provider 维度配置漂移。
    if (embedding.length !== VectorService.EMBEDDING_DIMENSION) {
      throw new BadRequestException(
        `embedding 维度必须是 ${VectorService.EMBEDDING_DIMENSION}`,
      );
    }

    // limit 与 threshold 做边界收敛，避免异常参数污染 SQL 结果。
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
      -- <=> 越小越相似，因此按距离升序排序。
      ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${safeLimit}
    `;

    return rows;
  }
}
