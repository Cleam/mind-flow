import { ArgumentsHost } from '@nestjs/common';
import { jest } from '@jest/globals';
import { BIZ_ERRORS } from '../errors/biz-errors.js';
import { BusinessException } from '../exceptions/business.exception.js';
import { BusinessExceptionFilter } from './business-exception.filter.js';

describe('BusinessExceptionFilter', () => {
  it('应返回统一失败结构', () => {
    const logger = {
      warn: jest.fn(),
    };
    const response = createResponse();
    const request = createRequest();
    const host = createHost(request, response);

    const filter = new BusinessExceptionFilter(logger as never);
    filter.catch(new BusinessException('BIZ_ERROR', '失败原因'), host);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      code: BIZ_ERRORS.BIZ_ERROR.code,
      data: null,
      msg: '失败原因',
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});

function createHost(request: unknown, response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

function createRequest(): {
  method: string;
  originalUrl: string;
  ip: string;
  headers: Record<string, string>;
} {
  return {
    method: 'POST',
    originalUrl: '/test-ingest',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  };
}

function createResponse(): {
  statusCode: number;
  body: unknown;
  status: (code: number) => { json: (payload: unknown) => void };
} {
  return {
    statusCode: 0,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return {
        json: (payload: unknown) => {
          this.body = payload;
        },
      };
    },
  };
}
