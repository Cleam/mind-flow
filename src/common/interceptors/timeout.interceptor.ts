import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Observable,
  TimeoutError,
  catchError,
  throwError,
  timeout,
} from 'rxjs';
import { REQUEST_TIMEOUT_METADATA_KEY } from '../decorators/request-timeout.decorator.js';

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly defaultTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timeoutMs = this.getTimeoutMs(context);

    return next.handle().pipe(
      timeout({ first: timeoutMs }),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException(`请求超时（>${timeoutMs}ms）`),
          );
        }

        return throwError(() => error);
      }),
    );
  }

  private getTimeoutMs(context: ExecutionContext): number {
    const custom = this.reflector.getAllAndOverride<number>(
      REQUEST_TIMEOUT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (typeof custom === 'number' && custom > 0) {
      return custom;
    }

    return this.defaultTimeoutMs;
  }
}
