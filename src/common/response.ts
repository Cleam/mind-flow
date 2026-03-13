import { SUCCESS_CODE } from './errors/biz-errors.js';

export interface UnifiedResponse<T = unknown> {
  code: number;
  data: T | null;
  msg: string;
}

export const SUCCESS_MSG = 'success';

export function successResponse<T>(data: T): UnifiedResponse<T> {
  return {
    code: SUCCESS_CODE,
    data,
    msg: SUCCESS_MSG,
  };
}

export function errorResponse(
  code: number,
  msg: string,
): UnifiedResponse<null> {
  return {
    code,
    data: null,
    msg,
  };
}

export function isUnifiedResponse(value: unknown): value is UnifiedResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  return (
    typeof maybe.code === 'number' &&
    'data' in maybe &&
    typeof maybe.msg === 'string'
  );
}
