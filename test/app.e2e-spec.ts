import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { IngestService } from './../src/ingest/ingest.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const ingestServiceMock = {
    testIngest: jest.fn().mockResolvedValue({ insertedCount: 2 }),
    processDocuments: jest.fn().mockResolvedValue({
      documentCount: 1,
      totalChunks: 2,
      savedCount: 2,
      failedCount: 0,
      status: 'success',
      failures: [],
    }),
    processFiles: jest.fn().mockResolvedValue({
      documentCount: 1,
      totalChunks: 3,
      savedCount: 3,
      failedCount: 0,
      status: 'success',
      failures: [],
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IngestService)
      .useValue(ingestServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  it('/ (GET)', () => {
    return request(getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('/test-ingest (POST)', async () => {
    await request(getHttpServer())
      .post('/test-ingest')
      .send({ texts: ['a', 'b'] })
      .expect(201)
      .expect({ insertedCount: 2 });

    expect(ingestServiceMock.testIngest).toHaveBeenCalledWith(['a', 'b']);
  });

  it('/upload (POST)', async () => {
    const payload = {
      documents: [{ content: '这是一个上传测试文档', source: 'e2e' }],
      chunkSize: 500,
      chunkOverlap: 100,
    };

    await request(getHttpServer())
      .post('/upload')
      .send(payload)
      .expect(201)
      .expect({
        documentCount: 1,
        totalChunks: 2,
        savedCount: 2,
        failedCount: 0,
        status: 'success',
        failures: [],
      });

    expect(ingestServiceMock.processDocuments).toHaveBeenCalledWith(
      expect.objectContaining(payload),
    );
  });

  it('/upload should reject invalid chunk options', async () => {
    await request(getHttpServer())
      .post('/upload')
      .send({
        documents: [{ content: 'abc' }],
        chunkSize: 100,
        chunkOverlap: 100,
      })
      .expect(400);
  });

  // ─── /upload-files ─────────────────────────────────────────────────────────

  it('/upload-files (POST) - txt 文件上传成功', async () => {
    const txtContent =
      '这是一份纯文本文档，内容足够长以便验证完整的上传入库流程。';

    await request(getHttpServer())
      .post('/upload-files')
      .attach('files', Buffer.from(txtContent, 'utf-8'), {
        filename: 'test.txt',
        contentType: 'text/plain',
      })
      .expect(201)
      .expect({
        documentCount: 1,
        totalChunks: 3,
        savedCount: 3,
        failedCount: 0,
        status: 'success',
        failures: [],
      });

    expect(ingestServiceMock.processFiles).toHaveBeenCalledTimes(1);
  });

  it('/upload-files (POST) - 支持自定义 chunkSize/chunkOverlap', async () => {
    await request(getHttpServer())
      .post('/upload-files')
      .attach('files', Buffer.from('内容', 'utf-8'), {
        filename: 'a.txt',
        contentType: 'text/plain',
      })
      .field('chunkSize', '300')
      .field('chunkOverlap', '60')
      .expect(201);

    const [, options] = ingestServiceMock.processFiles.mock.calls[0] as [
      unknown,
      { chunkSize: number; chunkOverlap: number },
    ];
    expect(options.chunkSize).toBe(300);
    expect(options.chunkOverlap).toBe(60);
  });

  it('/upload-files (POST) - chunkOverlap >= chunkSize 返回 400', async () => {
    await request(getHttpServer())
      .post('/upload-files')
      .attach('files', Buffer.from('hello', 'utf-8'), {
        filename: 'a.txt',
        contentType: 'text/plain',
      })
      .field('chunkSize', '100')
      .field('chunkOverlap', '100')
      .expect(400);
  });

  it('/upload-files (POST) - 不支持的文件类型返回 400', async () => {
    await request(getHttpServer())
      .post('/upload-files')
      .attach('files', Buffer.from('data'), {
        filename: 'evil.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);
  });

  it('/upload-files (POST) - 不传文件返回 400', async () => {
    await request(getHttpServer()).post('/upload-files').expect(400);
  });
});
