import { BadRequestException } from '@nestjs/common';
import { IngestService } from './ingest.service.js';
import { SmartChunkingService } from './smart-chunking.service.js';
import { TextCleanerService } from './text-cleaner.service.js';

describe('IngestService', () => {
  const embeddingVector: number[] = Array.from({ length: 1536 }, () => 0.1);

  /** 构造最小可用 IngestService 的工厂函数 */
  function makeService(
    saveChunk: (
      content: string,
      metadata: Record<string, unknown>,
    ) => Promise<void> = () => Promise.resolve(),
  ): IngestService {
    return new IngestService(
      { saveChunk } as never,
      {
        embed: (): Promise<number[]> => Promise.resolve(embeddingVector),
      } as never,
      { parseMany: () => ({ parsed: [], failures: [] }) } as never,
      new TextCleanerService(),
      new SmartChunkingService(),
    );
  }

  it('splitText should return single chunk for short text', () => {
    const service = makeService();
    const chunks = service.splitText('hello world', 500, 100);
    expect(chunks).toEqual(['hello world']);
  });

  it('splitText should split with overlap', () => {
    const service = makeService();
    const chunks = service.splitText('abcdefghijkl', 5, 2);
    expect(chunks).toEqual(['abcde', 'defgh', 'ghijk', 'jkl']);
  });

  it('splitText should throw when overlap is invalid', () => {
    const service = makeService();
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

    const service = makeService((content, metadata) => {
      callCount += 1;
      if (callCount === 2) return Promise.reject(new Error('db error'));
      savedItems.push({ content, metadata });
      return Promise.resolve();
    });

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

  it('processFiles should aggregate parse failures and chunk failures', async () => {
    // 一个 txt 文件成功，一个文件解析失败
    const goodFile = {
      originalname: 'a.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from(
        '这是测试内容，足够长以便生成至少一个有效的文本块用于向量化存储。',
      ),
      fieldname: 'files',
      encoding: '7bit',
      size: 30,
      stream: null as never,
      destination: '',
      filename: '',
      path: '',
    } satisfies Express.Multer.File;

    const service = new IngestService(
      { saveChunk: () => Promise.resolve() } as never,
      {
        embed: (): Promise<number[]> => Promise.resolve(embeddingVector),
      } as never,
      {
        parseMany: (files: Express.Multer.File[]) => ({
          parsed: [
            {
              fileIndex: 0,
              source: files[0].originalname,
              content: files[0].buffer.toString('utf-8'),
              format: 'txt' as const,
              parseWarnings: [],
            },
          ],
          failures: [
            { fileIndex: 1, source: 'bad.pdf', reason: 'PDF 解析失败' },
          ],
        }),
      } as never,
      new TextCleanerService(),
      new SmartChunkingService(),
    );

    const result = await service.processFiles([goodFile, goodFile], {
      chunkSize: 400,
      chunkOverlap: 80,
      chunkOptionsCheck: true,
    });

    expect(result.documentCount).toBe(2);
    // 至少 1 个解析失败记录在 failures 中
    expect(result.failures.some((f) => f.reason === 'PDF 解析失败')).toBe(true);
    expect(result.status).not.toBe('failed'); // 有成功的就不是 failed
  });
});
