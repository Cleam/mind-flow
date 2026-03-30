import { assertBizCatalog } from './assert-biz-catalog.js';

describe('assertBizCatalog', () => {
  it('默认目录应通过唯一性校验', () => {
    expect(() => assertBizCatalog()).not.toThrow();
  });

  it('存在重复 code 时应抛错', () => {
    const duplicated = {
      A: { code: 1, msg: 'a' },
      B: { code: 1, msg: 'b' },
    };

    expect(() => assertBizCatalog(duplicated)).toThrow(
      'BIZ_ERRORS 存在重复 code=1',
    );
  });
});
