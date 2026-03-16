import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../logger/logger.service.js';
import { BusinessException } from '../exceptions/business.exception.js';
import { errorResponse } from '../response.js';

@Catch(BusinessException)
export class BusinessExceptionFilter implements ExceptionFilter<BusinessException> {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: BusinessException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.pickRequestId(request);
    const duration = this.pickDuration(request);

    this.logger.warn('Business exception', {
      requestId,
      method: request.method,
      path: request.originalUrl,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
      duration,
      responseStatus: HttpStatus.OK,
      originalStatus: HttpStatus.OK,
      bizCode: exception.code,
      msg: exception.msg,
      exceptionType: exception.constructor.name,
    });

    response
      .status(HttpStatus.OK)
      .json(errorResponse(exception.code, exception.msg));
  }

  private pickRequestId(request: Request): string {
    const byContext = (request as Request & { requestId?: string }).requestId;
    if (typeof byContext === 'string' && byContext.trim()) {
      return byContext;
    }

    const fromHeader = request.headers['x-request-id'];
    if (typeof fromHeader === 'string' && fromHeader.trim()) {
      return fromHeader.trim();
    }

    if (Array.isArray(fromHeader) && fromHeader[0]?.trim()) {
      return fromHeader[0].trim();
    }

    return 'n/a';
  }

  private pickDuration(request: Request): number | null {
    const startedAt =
      (request as Request & { requestStartAt?: number }).requestStartAt ?? null;

    if (!startedAt || !Number.isFinite(startedAt)) {
      return null;
    }

    return Date.now() - startedAt;
  }
}
