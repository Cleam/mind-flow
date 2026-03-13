import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { SKIP_WRAP_RESPONSE_METADATA_KEY } from '../decorators/skip-wrap-response.decorator.js';
import { isUnifiedResponse, successResponse } from '../response.js';

@Injectable()
export class WrapResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.shouldSkip(context)) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: unknown) => {
        this.setSuccessStatus(response);

        if (isUnifiedResponse(data)) {
          return data;
        }

        // 非对象响应（例如纯文本）保持原样，避免改变历史接口行为。
        if (
          data === null ||
          data === undefined ||
          typeof data === 'string' ||
          typeof data === 'number' ||
          typeof data === 'boolean'
        ) {
          return data;
        }

        return successResponse(data);
      }),
    );
  }

  private shouldSkip(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    return this.reflector.getAllAndOverride<boolean>(
      SKIP_WRAP_RESPONSE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
  }

  private setSuccessStatus(response: Response): void {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      response.status(200);
    }
  }
}
