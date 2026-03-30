import { BIZ_ERRORS } from '../errors/biz-errors.js';
import { BusinessException } from './business.exception.js';

describe('BusinessException', () => {
  it('应按 key 生成 code/msg', () => {
    const error = new BusinessException('BAD_REQUEST');

    expect(error.code).toBe(BIZ_ERRORS.BAD_REQUEST.code);
    expect(error.msg).toBe(BIZ_ERRORS.BAD_REQUEST.msg);
  });

  it('应支持自定义 msg', () => {
    const error = new BusinessException('BIZ_ERROR', '自定义文案');

    expect(error.code).toBe(BIZ_ERRORS.BIZ_ERROR.code);
    expect(error.msg).toBe('自定义文案');
  });

  it('fromUnknown(string) 应映射到 BIZ_ERROR', () => {
    const error = BusinessException.fromUnknown('字符串错误');

    expect(error.code).toBe(BIZ_ERRORS.BIZ_ERROR.code);
    expect(error.msg).toBe('字符串错误');
  });

  it('fromUnknown(object) 应回退到 INTERNAL_ERROR', () => {
    const error = BusinessException.fromUnknown({});

    expect(error.code).toBe(BIZ_ERRORS.INTERNAL_ERROR.code);
    expect(error.msg).toBe(BIZ_ERRORS.INTERNAL_ERROR.msg);
  });
});
