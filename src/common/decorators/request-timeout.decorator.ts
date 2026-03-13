import { SetMetadata } from '@nestjs/common';

export const REQUEST_TIMEOUT_METADATA_KEY = 'request-timeout-ms';

export const RequestTimeout = (ms: number): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUEST_TIMEOUT_METADATA_KEY, ms);
