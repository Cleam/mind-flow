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

    this.logger.warn('Business exception', {
      method: request.method,
      path: request.originalUrl,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
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
}
