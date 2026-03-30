export const SUCCESS_CODE = 0;

export const BIZ_ERRORS = {
  BIZ_ERROR: { code: 10000, msg: '业务异常' },
  VALIDATION_FAILED: { code: 10001, msg: '参数校验失败' },
  BAD_REQUEST: { code: 10002, msg: '请求参数错误' },
  UNAUTHORIZED: { code: 10003, msg: '未授权' },
  FORBIDDEN: { code: 10004, msg: '禁止访问' },
  NOT_FOUND: { code: 10005, msg: '资源不存在' },
  REQUEST_TIME_OUT: { code: 10006, msg: '请求超时' },
  TOO_MANY_REQUESTS: { code: 10007, msg: '请求过于频繁' },
  INTERNAL_ERROR: { code: 10008, msg: '服务器内部错误' },
} as const;

export type BizKey = keyof typeof BIZ_ERRORS;

export type BizCatalogItem = (typeof BIZ_ERRORS)[BizKey];

export const FALLBACK_BIZ_KEY: BizKey = 'INTERNAL_ERROR';
