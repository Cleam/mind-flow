import { SetMetadata } from '@nestjs/common';

export const SKIP_WRAP_RESPONSE_METADATA_KEY = 'skip-wrap-response';

export const SkipWrapResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_WRAP_RESPONSE_METADATA_KEY, true);
