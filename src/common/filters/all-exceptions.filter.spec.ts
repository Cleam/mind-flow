import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { BIZ_ERRORS } from '../errors/biz-errors.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  it('DTO 校验异常应映射 VALIDATION_FAILED', () => {
    const logger = { error: jest.fn() };
    const response = createResponse();
    const host = createHost(createRequest(), response);

    const exception = new BadRequestException({
      message: ['name should not be empty'],
      error: 'Bad Request',
      statusCode: 400,
    });

    const filter = new AllExceptionsFilter(logger as never);
    filter.catch(exception, host);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      code: BIZ_ERRORS.VALIDATION_FAILED.code,
      data: null,
      msg: 'name should not be empty',
    });
  });

  it('未知异常应映射 INTERNAL_ERROR', () => {
    const logger = { error: jest.fn() };
    const response = createResponse();
    const host = createHost(createRequest(), response);

    const filter = new AllExceptionsFilter(logger as never);
    filter.catch(new Error('boom'), host);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      code: BIZ_ERRORS.INTERNAL_ERROR.code,
      data: null,
      msg: 'boom',
    });
  });
});

function createHost(request: unknown, response: unknown): never {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as never;
}

function createRequest(): {
  method: string;
  originalUrl: string;
  ip: string;
  headers: Record<string, string>;
} {
  return {
    method: 'POST',
    originalUrl: '/upload',
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
