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
});
