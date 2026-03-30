import {
  CallHandler,
  ExecutionContext,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import { Observable, delay, firstValueFrom, of } from 'rxjs';
import { TimeoutInterceptor } from './timeout.interceptor.js';

describe('TimeoutInterceptor', () => {
  it('未超时时应正常透传', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const interceptor = new TimeoutInterceptor(reflector, 50);
    const context = createExecutionContext();
    const next: CallHandler = {
      handle: (): Observable<unknown> => of({ ok: true }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, next));
    expect(result).toEqual({ ok: true });
  });

  it('超过阈值应抛 RequestTimeoutException', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(5);

    const interceptor = new TimeoutInterceptor(reflector, 50);
    const context = createExecutionContext();
    const next: CallHandler = {
      handle: (): Observable<unknown> => of('ok').pipe(delay(20)),
    };

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBeInstanceOf(RequestTimeoutException);
  });
});

function createExecutionContext(): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}) as never,
  } as unknown as ExecutionContext;
}
