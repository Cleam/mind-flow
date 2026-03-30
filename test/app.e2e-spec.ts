import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  RequestTimeoutException,
  ValidationPipe,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { AppModule } from './../src/app.module.js';
import { BIZ_ERRORS } from './../src/common/errors/biz-errors.js';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter.js';
import { BusinessExceptionFilter } from './../src/common/filters/business-exception.filter.js';
import { RequestLoggingInterceptor } from './../src/common/interceptors/request-logging.interceptor.js';
import { TimeoutInterceptor } from './../src/common/interceptors/timeout.interceptor.js';
import { WrapResponseInterceptor } from './../src/common/interceptors/wrap-response.interceptor.js';
import { BusinessException } from './../src/common/exceptions/business.exception.js';
import {
  IngestService,
  UploadDocumentsResult,
} from './../src/ingest/ingest.service.js';
import { AppLoggerService } from './../src/logger/logger.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const ingestServiceMock = {
    testIngest: jest
      .fn<() => Promise<{ insertedCount: number }>>()
      .mockResolvedValue({ insertedCount: 2 }),
    processDocuments: jest
      .fn<() => Promise<UploadDocumentsResult>>()
      .mockResolvedValue({
        documentCount: 1,
        totalChunks: 2,
        savedCount: 2,
        failedCount: 0,
        status: 'success',
        failures: [],
      }),
    processFiles: jest
      .fn<() => Promise<UploadDocumentsResult>>()
      .mockResolvedValue({
        documentCount: 1,
        totalChunks: 3,
        savedCount: 3,
        failedCount: 0,
        status: 'success',
        failures: [],
      }),
  };
  const loggerMock = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IngestService)
      .useValue(ingestServiceMock)
      .overrideProvider(AppLoggerService)
      .useValue(loggerMock)
      .compile();

    app = moduleFixture.createNestApplication();
    const reflector = app.get(Reflector);
    const logger = app.get(AppLoggerService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(
      new RequestLoggingInterceptor(logger),
      new TimeoutInterceptor(reflector, 60_000),
      new WrapResponseInterceptor(reflector),
    );
    app.useGlobalFilters(
      new AllExceptionsFilter(logger),
      new BusinessExceptionFilter(logger),
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
      .expect(200)
      .expect({
        code: 0,
        data: { insertedCount: 2 },
        msg: 'success',
      });

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
      .expect(200)
      .expect({
        code: 0,
        data: {
          documentCount: 1,
          totalChunks: 2,
          savedCount: 2,
          failedCount: 0,
          status: 'success',
          failures: [],
        },
        msg: 'success',
      });

    expect(ingestServiceMock.processDocuments).toHaveBeenCalledWith(
      expect.objectContaining(payload),
    );
  });

  it('/upload should reject invalid chunk options', async () => {
    const response = await request(getHttpServer())
      .post('/upload')
      .send({
        documents: [{ content: 'abc' }],
        chunkSize: 100,
        chunkOverlap: 100,
      })
      .expect(200);

    expect(response.body.code).toBe(BIZ_ERRORS.VALIDATION_FAILED.code);
    expect(response.body.data).toBeNull();
    expect(typeof response.body.msg).toBe('string');
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
      .expect(200)
      .expect({
        code: 0,
        data: {
          documentCount: 1,
          totalChunks: 3,
          savedCount: 3,
          failedCount: 0,
          status: 'success',
          failures: [],
        },
        msg: 'success',
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
      .expect(200);

    const [, options] = ingestServiceMock.processFiles.mock
      .calls[0] as unknown as [
      unknown,
      { chunkSize: number; chunkOverlap: number },
    ];
    expect(options.chunkSize).toBe(300);
    expect(options.chunkOverlap).toBe(60);
  });

  it('/upload-files (POST) - chunkOverlap >= chunkSize 返回 400', async () => {
    const response = await request(getHttpServer())
      .post('/upload-files')
      .attach('files', Buffer.from('hello', 'utf-8'), {
        filename: 'a.txt',
        contentType: 'text/plain',
      })
      .field('chunkSize', '100')
      .field('chunkOverlap', '100')
      .expect(200);

    expect(response.body.code).toBe(BIZ_ERRORS.VALIDATION_FAILED.code);
    expect(response.body.data).toBeNull();
    expect(typeof response.body.msg).toBe('string');
  });

  it('/upload-files (POST) - 不支持的文件类型返回 400', async () => {
    const response = await request(getHttpServer())
      .post('/upload-files')
      .attach('files', Buffer.from('data'), {
        filename: 'evil.exe',
        contentType: 'application/octet-stream',
      })
      .expect(200);

    expect(response.body.code).toBe(BIZ_ERRORS.BAD_REQUEST.code);
    expect(response.body.data).toBeNull();
    expect(response.body.msg).toContain('文件类型不受支持');
  });

  it('/upload-files (POST) - 不传文件返回 400', async () => {
    await request(getHttpServer()).post('/upload-files').expect(200).expect({
      code: BIZ_ERRORS.BAD_REQUEST.code,
      data: null,
      msg: '至少上传一个文件',
    });
  });

  it('/test-ingest (POST) - 业务异常映射', async () => {
    ingestServiceMock.testIngest.mockRejectedValueOnce(
      new BusinessException('BIZ_ERROR', '自定义业务失败'),
    );

    await request(getHttpServer())
      .post('/test-ingest')
      .send({ texts: ['a'] })
      .expect(200)
      .expect({
        code: BIZ_ERRORS.BIZ_ERROR.code,
        data: null,
        msg: '自定义业务失败',
      });
  });

  it('/test-ingest (POST) - 未知异常映射', async () => {
    ingestServiceMock.testIngest.mockRejectedValueOnce(
      new Error('未知错误 boom'),
    );

    await request(getHttpServer())
      .post('/test-ingest')
      .send({ texts: ['a'] })
      .expect(200)
      .expect({
        code: BIZ_ERRORS.INTERNAL_ERROR.code,
        data: null,
        msg: '未知错误 boom',
      });
  });

  it('/test-ingest (POST) - 超时异常映射', async () => {
    ingestServiceMock.testIngest.mockRejectedValueOnce(
      new RequestTimeoutException('请求超时'),
    );

    await request(getHttpServer())
      .post('/test-ingest')
      .send({ texts: ['a'] })
      .expect(200)
      .expect({
        code: BIZ_ERRORS.REQUEST_TIME_OUT.code,
        data: null,
        msg: BIZ_ERRORS.REQUEST_TIME_OUT.msg,
      });
  });
});
