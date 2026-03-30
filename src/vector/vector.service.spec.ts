import { BadRequestException } from '@nestjs/common';
import { VectorService } from './vector.service.js';

describe('VectorService', () => {
  it('should return search results from queryRaw', async () => {
    const prisma = {
      $queryRaw: () =>
        Promise.resolve([
          {
            id: 1n,
            content: 'chunk-a',
            metadata: { source: 'doc-a', chunkIndex: 0 },
            score: 0.88,
          },
        ]),
    };

    const service = new VectorService(prisma as never);
    const embedding = Array.from({ length: 1536 }, () => 0.1);

    const result = await service.search(embedding, 3, 0.5);

    expect(result).toEqual([
      {
        id: 1n,
        content: 'chunk-a',
        metadata: { source: 'doc-a', chunkIndex: 0 },
        score: 0.88,
      },
    ]);
  });

  it('should throw when embedding dimension is invalid', async () => {
    const prisma = {
      $queryRaw: async () => Promise.resolve([]),
    };

    const service = new VectorService(prisma as never);

    await expect(service.search([0.1, 0.2], 3, 0.5)).rejects.toThrow(
      BadRequestException,
    );
  });
});
