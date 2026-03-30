import { HttpException, HttpStatus } from '@nestjs/common';
import { BIZ_ERRORS, BizKey, FALLBACK_BIZ_KEY } from '../errors/biz-errors.js';

export class BusinessException extends HttpException {
  readonly key: BizKey;
  readonly code: number;
  readonly msg: string;

  constructor(key: BizKey, msg?: string) {
    const item = BIZ_ERRORS[key] ?? BIZ_ERRORS[FALLBACK_BIZ_KEY];
    const finalMsg = msg?.trim() ? msg : item.msg;
    super({ code: item.code, msg: finalMsg }, HttpStatus.OK);

    this.key = key;
    this.code = item.code;
    this.msg = finalMsg;
  }

  static fromUnknown(error: unknown): BusinessException {
    if (error instanceof BusinessException) {
      return error;
    }

    if (typeof error === 'string' && error.trim()) {
      return new BusinessException('BIZ_ERROR', error);
    }

    return new BusinessException(FALLBACK_BIZ_KEY);
  }
}

export { BusinessException as BizException };
