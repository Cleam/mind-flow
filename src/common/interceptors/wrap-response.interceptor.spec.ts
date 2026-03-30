import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import { Observable, firstValueFrom, of } from 'rxjs';
import { SKIP_WRAP_RESPONSE_METADATA_KEY } from '../decorators/skip-wrap-response.decorator.js';
import { WrapResponseInterceptor } from './wrap-response.interceptor.js';

describe('WrapResponseInterceptor', () => {
  it('普通对象应包装为统一成功结构', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const response = createResponse(201);
    const context = createExecutionContext(response);
    const next: CallHandler = {
      handle: (): Observable<unknown> => of({ id: 1 }),
    };

    const interceptor = new WrapResponseInterceptor(reflector);
    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ code: 0, data: { id: 1 }, msg: 'success' });
    expect(response.statusCode).toBe(200);
  });

  it('已是统一结构时应幂等透传', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const response = createResponse(200);
    const context = createExecutionContext(response);
    const next: CallHandler = {
      handle: (): Observable<unknown> =>
        of({ code: 99, data: null, msg: 'already wrapped' }),
    };

    const interceptor = new WrapResponseInterceptor(reflector);
    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ code: 99, data: null, msg: 'already wrapped' });
  });

  it('被跳过时应直接返回原始响应', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_WRAP_RESPONSE_METADATA_KEY) {
        return true;
      }

      return undefined;
    });

    const response = createResponse(201);
    const context = createExecutionContext(response);
    const next: CallHandler = {
      handle: (): Observable<unknown> => of({ raw: true }),
    };

    const interceptor = new WrapResponseInterceptor(reflector);
    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ raw: true });
    expect(response.statusCode).toBe(201);
  });
});

function createExecutionContext(response: {
  statusCode: number;
  status: (code: number) => void;
}): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}) as never,
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createResponse(initialStatusCode: number): {
  statusCode: number;
  status: (code: number) => void;
} {
  return {
    statusCode: initialStatusCode,
    status(code: number): void {
      this.statusCode = code;
    },
  };
}
