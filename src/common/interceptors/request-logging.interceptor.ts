import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../logger/logger.service.js';
import { SUCCESS_CODE } from '../errors/biz-errors.js';
import { UnifiedResponse, isUnifiedResponse } from '../response.js';

type HttpRequestWithLogContext = Request & {
  requestId?: string;
  requestStartAt?: number;
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<HttpRequestWithLogContext>();
    const response = ctx.getResponse<Response>();
    const requestId = this.resolveRequestId(request);
    const start = Date.now();
    request.requestId = requestId;
    request.requestStartAt = start;
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap((result: unknown) => {
        const duration = Date.now() - start;
        const normalized = this.normalizeResult(result);

        this.logger.log('HTTP request success', {
          requestId,
          timestamp: new Date().toISOString(),
          method: request.method,
          path: request.originalUrl,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
          query: this.sanitizeValue(request.query),
          params: this.sanitizeValue(request.params),
          body: this.sanitizeValue(request.body),
          duration,
          responseStatus: response.statusCode,
          bizCode: normalized.code,
          msg: normalized.msg,
          dataPreview: this.sanitizeValue(normalized.data),
        });
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - start;
        const normalizedError = this.normalizeError(error);

        this.logger.error('HTTP request failed', {
          requestId,
          timestamp: new Date().toISOString(),
          method: request.method,
          path: request.originalUrl,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
          query: this.sanitizeValue(request.query),
          params: this.sanitizeValue(request.params),
          body: this.sanitizeValue(request.body),
          duration,
          responseStatus: response.statusCode,
          bizCode: null,
          msg: normalizedError.message,
          exceptionType: normalizedError.type,
          stack: normalizedError.stack,
          cause: normalizedError.cause,
        });

        return throwError(() => error);
      }),
    );
  }

  private resolveRequestId(request: Request): string {
    const fromHeader = request.headers['x-request-id'];
    if (typeof fromHeader === 'string' && fromHeader.trim()) {
      return fromHeader.trim();
    }

    if (Array.isArray(fromHeader) && fromHeader[0]?.trim()) {
      return fromHeader[0].trim();
    }

    return randomUUID();
  }

  private normalizeError(error: unknown): {
    type: string;
    message: string;
    stack?: string;
    cause?: unknown;
  } {
    if (error instanceof Error) {
      return {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack,
        cause: this.sanitizeValue((error as Error & { cause?: unknown }).cause),
      };
    }

    return {
      type: typeof error,
      message: 'Unknown error',
      cause: this.sanitizeValue(error),
    };
  }

  private sanitizeValue(value: unknown, depth = 0): unknown {
    const maxDepth = 3;
    const maxStringLength = 500;
    const maxArrayLength = 20;
    const maxObjectKeys = 30;

    if (value === null || value === undefined) {
      return value;
    }

    if (depth > maxDepth) {
      return '[MaxDepthReached]';
    }

    if (typeof value === 'string') {
      return value.length > maxStringLength
        ? `${value.slice(0, maxStringLength)}...[truncated]`
        : value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return `[Buffer length=${value.length}]`;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, maxArrayLength)
        .map((item) => this.sanitizeValue(item, depth + 1));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).slice(
        0,
        maxObjectKeys,
      );

      for (const [key, item] of entries) {
        if (/password|token|secret|apikey|api_key/i.test(key)) {
          result[key] = '[REDACTED]';
          continue;
        }

        result[key] = this.sanitizeValue(item, depth + 1);
      }

      return result;
    }

    if (typeof value === 'function') {
      return '[Function]';
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    return '[UnsupportedValue]';
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
