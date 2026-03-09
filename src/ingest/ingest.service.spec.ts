import { BadRequestException } from '@nestjs/common';
import { IngestService } from './ingest.service.js';

describe('IngestService', () => {
  const embeddingVector: number[] = Array.from({ length: 1536 }, () => 0.1);

  it('splitText should return single chunk for short text', () => {
    const service = new IngestService(
      {
        saveChunk: (): Promise<void> => Promise.resolve(),
      } as never,
      {
        embed: (): Promise<number[]> => Promise.resolve(embeddingVector),
      } as never,
    );

    const chunks = service.splitText('hello world', 500, 100);
    expect(chunks).toEqual(['hello world']);
  });

  it('splitText should split with overlap', () => {
    const service = new IngestService(
      {
        saveChunk: (): Promise<void> => Promise.resolve(),
      } as never,
      {
        embed: (): Promise<number[]> => Promise.resolve(embeddingVector),
      } as never,
    );

    const chunks = service.splitText('abcdefghijkl', 5, 2);
    expect(chunks).toEqual(['abcde', 'defgh', 'ghijk', 'jkl']);
  });

  it('splitText should throw when overlap is invalid', () => {
    const service = new IngestService(
      {
        saveChunk: (): Promise<void> => Promise.resolve(),
      } as never,
      {
        embed: (): Promise<number[]> => Promise.resolve(embeddingVector),
      } as never,
    );

    expect(() => service.splitText('abcdef', 5, 5)).toThrow(
      BadRequestException,
    );
  });

  it('processDocuments should continue when single chunk fails', async () => {
    const savedItems: Array<{
      content: string;
      metadata: Record<string, unknown>;
    }> = [];
    let callCount = 0;

    const service = new IngestService(
      {
        saveChunk: (
          content: string,
          metadata: Record<string, unknown>,
        ): Promise<void> => {
          callCount += 1;
          if (callCount === 2) {
            return Promise.reject(new Error('db error'));
          }
          savedItems.push({ content, metadata });
          return Promise.resolve();
        },
      } as never,
      {
        embed: (): Promise<number[]> => Promise.resolve(embeddingVector),
      } as never,
    );

    const result = await service.processDocuments({
      documents: [{ content: 'abcdefghij', source: 'doc-1' }],
      chunkSize: 5,
      chunkOverlap: 2,
      chunkOptionsCheck: true,
    });

    expect(result.totalChunks).toBe(3);
    expect(result.savedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.status).toBe('partial');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toContain('db error');
    expect(savedItems).toHaveLength(2);
  });
});
