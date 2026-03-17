import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  RequestTimeoutException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AppModule } from '../src/app.module.js';
import { BIZ_ERRORS } from '../src/common/errors/biz-errors.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { BusinessExceptionFilter } from '../src/common/filters/business-exception.filter.js';
import { RequestLoggingInterceptor } from '../src/common/interceptors/request-logging.interceptor.js';
import { TimeoutInterceptor } from '../src/common/interceptors/timeout.interceptor.js';
import { WrapResponseInterceptor } from '../src/common/interceptors/wrap-response.interceptor.js';
import { BusinessException } from '../src/common/exceptions/business.exception.js';
import { AppLoggerService } from '../src/logger/logger.service.js';
import { ChatService } from '../src/chat/chat.service.js';

describe('ChatController (e2e)', () => {
  let app: INestApplication;

  const chatServiceMock = {
    ask: jest.fn<
      () => Promise<{
        answer: string;
        sources: Array<{ chunkId: string; source: string; score: number }>;
      }>
    >(),
    createSession: jest.fn(),
    getHistory: jest.fn(),
    askWithHistoryStream: jest.fn(),
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

    chatServiceMock.ask.mockResolvedValue({
      answer: '根据资料，RAG 是检索增强生成。',
      sources: [{ chunkId: '1', source: 'doc-a', score: 0.9 }],
    });
    chatServiceMock.createSession.mockReturnValue({
      sessionId: 'sess_20260317_abc123',
      createdAt: '2026-03-17T00:00:00.000Z',
    });
    chatServiceMock.getHistory.mockResolvedValue({
      sessionId: 's1',
      limit: 10,
      offset: 0,
      items: [
        {
          id: '1',
          sessionId: 's1',
          role: 'user',
          content: '什么是 RAG？',
          createdAt: '2026-03-17T00:00:00.000Z',
        },
      ],
    });
    chatServiceMock.askWithHistoryStream.mockReturnValue(
      of(
        { type: 'token', data: { token: '根据' } },
        {
          type: 'done',
          data: {
            answer: '根据资料，RAG 是检索增强生成。',
            sources: [{ chunkId: '1', source: 'doc-a', score: 0.9 }],
            rewriteQuery: 'RAG 是什么',
          },
        },
      ),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ChatService)
      .useValue(chatServiceMock)
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

  it('/chat/ask (POST) should return answer and sources', async () => {
    await request(getHttpServer())
      .post('/chat/ask')
      .send({ question: '什么是 RAG？' })
      .expect(200)
      .expect({
        code: 0,
        data: {
          answer: '根据资料，RAG 是检索增强生成。',
          sources: [{ chunkId: '1', source: 'doc-a', score: 0.9 }],
        },
        msg: 'success',
      });
  });

  it('/chat/sessions (POST) should create a new session', async () => {
    await request(getHttpServer())
      .post('/chat/sessions')
      .send({})
      .expect(200)
      .expect({
        code: 0,
        data: {
          sessionId: 'sess_20260317_abc123',
          createdAt: '2026-03-17T00:00:00.000Z',
        },
        msg: 'success',
      });
  });

  it('/chat/ask (POST) should fail validation for missing question', async () => {
    const response = await request(getHttpServer())
      .post('/chat/ask')
      .send({})
      .expect(200);

    const responseBody = response.body as {
      code: number;
      data: unknown;
    };

    expect(responseBody.code).toBe(BIZ_ERRORS.VALIDATION_FAILED.code);
    expect(responseBody.data).toBeNull();
  });

  it('/chat/ask (POST) should map business exception', async () => {
    chatServiceMock.ask.mockRejectedValueOnce(
      new BusinessException('BIZ_ERROR', '无相关文档'),
    );

    await request(getHttpServer())
      .post('/chat/ask')
      .send({ question: '未知问题' })
      .expect(200)
      .expect({
        code: BIZ_ERRORS.BIZ_ERROR.code,
        data: null,
        msg: '无相关文档',
      });
  });

  it('/chat/ask (POST) should map timeout exception', async () => {
    chatServiceMock.ask.mockRejectedValueOnce(
      new RequestTimeoutException('timeout'),
    );

    await request(getHttpServer())
      .post('/chat/ask')
      .send({ question: '超时场景' })
      .expect(200)
      .expect({
        code: BIZ_ERRORS.REQUEST_TIME_OUT.code,
        data: null,
        msg: BIZ_ERRORS.REQUEST_TIME_OUT.msg,
      });
  });

  it('/chat/history (GET) should return paged history', async () => {
    await request(getHttpServer())
      .get('/chat/history')
      .query({ sessionId: 's1', limit: 10, offset: 0 })
      .expect(200)
      .expect({
        code: 0,
        data: {
          sessionId: 's1',
          limit: 10,
          offset: 0,
          items: [
            {
              id: '1',
              sessionId: 's1',
              role: 'user',
              content: '什么是 RAG？',
              createdAt: '2026-03-17T00:00:00.000Z',
            },
          ],
        },
        msg: 'success',
      });
  });

  it('/chat/stream (POST) should return sse data', async () => {
    const response = await request(getHttpServer())
      .post('/chat/stream')
      .send({ sessionId: 's1', question: '什么是 RAG？' })
      .expect(200);

    const text = response.text;
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');
    expect(text).toContain('"answer":"根据资料，RAG 是检索增强生成。"');
  });
});
