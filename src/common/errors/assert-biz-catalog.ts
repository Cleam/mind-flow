import { BIZ_ERRORS, BizKey } from './biz-errors.js';

type BizCatalog = Record<
  string,
  {
    code: number;
    msg: string;
  }
>;

export function assertBizCatalog(catalog: BizCatalog = BIZ_ERRORS): void {
  const seen = new Map<number, BizKey>();

  for (const [key, item] of Object.entries(catalog) as [
    BizKey,
    BizCatalog[BizKey],
  ][]) {
    if (seen.has(item.code)) {
      const duplicate = seen.get(item.code);
      throw new Error(
        `BIZ_ERRORS 存在重复 code=${item.code}，冲突项：${duplicate ?? 'UNKNOWN'} 与 ${key}`,
      );
    }

    seen.set(item.code, key);
  }
}
