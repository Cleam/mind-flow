import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../logger/logger.service.js';
import { SUCCESS_CODE } from '../errors/biz-errors.js';
import { UnifiedResponse, isUnifiedResponse } from '../response.js';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap((result: unknown) => {
        const duration = Date.now() - start;
        const normalized = this.normalizeResult(result);

        this.logger.log('HTTP request success', {
          timestamp: new Date().toISOString(),
          method: request.method,
          path: request.originalUrl,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
          duration,
          responseStatus: response.statusCode,
          bizCode: normalized.code,
          msg: normalized.msg,
        });
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - start;
        this.logger.error('HTTP request failed', {
          timestamp: new Date().toISOString(),
          method: request.method,
          path: request.originalUrl,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
          duration,
          responseStatus: response.statusCode,
          bizCode: null,
          msg: error instanceof Error ? error.message : 'Unknown error',
          exceptionType:
            error instanceof Error ? error.constructor.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined,
        });

        return throwError(() => error);
      }),
    );
  }

  private normalizeResult(result: unknown): UnifiedResponse<unknown> {
    if (isUnifiedResponse(result)) {
      return result;
    }

    return {
      code: SUCCESS_CODE,
      data: result,
      msg: 'success',
    };
  }
}
