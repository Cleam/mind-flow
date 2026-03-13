import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  RequestTimeoutException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../logger/logger.service.js';
import { BIZ_ERRORS, BizKey, FALLBACK_BIZ_KEY } from '../errors/biz-errors.js';
import { errorResponse } from '../response.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatus(exception);
    const { key, msg } = this.mapException(exception, status);
    const biz = BIZ_ERRORS[key] ?? BIZ_ERRORS[FALLBACK_BIZ_KEY];

    this.logger.error('Unhandled exception', {
      method: request.method,
      path: request.originalUrl,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
      responseStatus: HttpStatus.OK,
      originalStatus: status,
      bizCode: biz.code,
      msg,
      exceptionType:
        exception instanceof Error
          ? exception.constructor.name
          : typeof exception,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(HttpStatus.OK).json(errorResponse(biz.code, msg));
  }

  private getStatus(exception: unknown): HttpStatus {
    if (exception instanceof HttpException) {
      return exception.getStatus() as HttpStatus;
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private mapException(
    exception: unknown,
    status: HttpStatus,
  ): { key: BizKey; msg: string } {
    if (exception instanceof RequestTimeoutException) {
      return {
        key: 'REQUEST_TIME_OUT',
        msg: BIZ_ERRORS.REQUEST_TIME_OUT.msg,
      };
    }

    if (exception instanceof HttpException) {
      const normalized = this.normalizeHttpExceptionMessage(exception);
      if (status === HttpStatus.BAD_REQUEST) {
        return {
          key: this.isValidationError(exception)
            ? 'VALIDATION_FAILED'
            : 'BAD_REQUEST',
          msg: normalized,
        };
      }

      if (status === HttpStatus.UNAUTHORIZED) {
        return { key: 'UNAUTHORIZED', msg: normalized };
      }

      if (status === HttpStatus.FORBIDDEN) {
        return { key: 'FORBIDDEN', msg: normalized };
      }

      if (status === HttpStatus.NOT_FOUND) {
        return { key: 'NOT_FOUND', msg: normalized };
      }

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        return { key: 'TOO_MANY_REQUESTS', msg: normalized };
      }

      return { key: 'INTERNAL_ERROR', msg: normalized };
    }

    return {
      key: 'INTERNAL_ERROR',
      msg:
        exception instanceof Error
          ? exception.message
          : BIZ_ERRORS.INTERNAL_ERROR.msg,
    };
  }

  private normalizeHttpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string' && response.trim()) {
      return response;
    }

    if (response && typeof response === 'object') {
      const payload = response as Record<string, unknown>;
      const message = payload.message;

      if (Array.isArray(message)) {
        return message.join('; ');
      }

      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return exception.message || BIZ_ERRORS.INTERNAL_ERROR.msg;
  }

  private isValidationError(exception: HttpException): boolean {
    const response = exception.getResponse();
    if (!response || typeof response !== 'object') {
      return false;
    }

    const message = (response as Record<string, unknown>).message;
    return Array.isArray(message);
  }
}
