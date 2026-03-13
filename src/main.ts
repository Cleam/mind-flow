import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { assertBizCatalog } from './common/errors/assert-biz-catalog.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { BusinessExceptionFilter } from './common/filters/business-exception.filter.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  TimeoutInterceptor,
} from './common/interceptors/timeout.interceptor.js';
import { WrapResponseInterceptor } from './common/interceptors/wrap-response.interceptor.js';
import { AppLoggerService } from './logger/logger.service.js';

async function bootstrap() {
  assertBizCatalog();

  const app = await NestFactory.create(AppModule);
  const logger = app.get(AppLoggerService);
  const reflector = app.get(Reflector);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(
    new RequestLoggingInterceptor(logger),
    new TimeoutInterceptor(reflector, DEFAULT_REQUEST_TIMEOUT_MS),
    new WrapResponseInterceptor(reflector),
  );
  app.useGlobalFilters(
    new AllExceptionsFilter(logger),
    new BusinessExceptionFilter(logger),
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log();
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log();
}
void bootstrap();
