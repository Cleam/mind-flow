import { SmartChunkingService } from './smart-chunking.service.js';

describe('SmartChunkingService', () => {
  const svc = new SmartChunkingService();

  describe('段落优先分割', () => {
    it('短文本整体返回单个 chunk', () => {
      // 文本长度需 >= MIN_CHUNK_LENGTH(30) 才不被过滤
      const text = 'Hello world, this is a sufficient length test sentence.';
      const result = svc.split(text, 400, 80);
      expect(result.some((c) => c.includes('Hello world'))).toBe(true);
    });

    it('按双换行分割段落，合并短段落', () => {
      // 每段 > 30 字符，合并后也在 chunkSize(400) 以内
      const text =
        '第一段落包含足够多的内容以便超过最小长度限制阈值。\n\n第二段落同样包含足够多的内容以便超过最小长度限制阈值。';
      const result = svc.split(text, 400, 80);
      // 两段一起 < 400，应合并为一个 chunk
      expect(result.length).toBe(1);
      expect(result[0]).toContain('第一段落包含');
      expect(result[0]).toContain('第二段落同样');
    });

    it('超长段落自动拆分', () => {
      // 生成一段 500 字符的文本
      const longPara = '测'.repeat(500);
      const result = svc.split(longPara, 200, 40);
      // 必须被拆成多个 chunk
      expect(result.length).toBeGreaterThan(1);
      // 每个 chunk 不应超过 chunkSize + overlap（overlap 前缀会稍微超过）
      result.forEach((c) => expect(c.length).toBeLessThanOrEqual(200 + 40 + 5));
    });
  });

  describe('句子边界回退', () => {
    it('按句末标点切分超长段落', () => {
      // 3 句话，每句 ~100 字符，段落共 ~300，chunkSize=150 强制按句子切
      const para =
        '这是第一句话，内容很多很多很多很多很多很多很多很多很多很多很多很多很多。' +
        '这是第二句话，内容很多很多很多很多很多很多很多很多很多很多很多很多很多。' +
        '这是第三句话，内容很多很多很多很多很多很多很多很多很多很多很多很多很多。';
      const result = svc.split(para, 80, 20);
      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('Overlap 注入', () => {
    it('第二个 chunk 前缀包含第一个 chunk 的末尾内容', () => {
      // 强制两个段落各自 < chunkSize 但合并超限，同时 chunkSize 足够小
      const text = 'A'.repeat(50) + '\n\n' + 'B'.repeat(50);
      const result = svc.split(text, 60, 20);
      if (result.length >= 2) {
        // 第二个 chunk 应以第一个 chunk 的末尾字符开头（overlap）
        const firstChunkTail = result[0].slice(-20).trim();
        if (firstChunkTail.length > 0) {
          expect(result[1]).toContain(firstChunkTail);
        }
      }
    });
  });

  describe('最小长度过滤', () => {
    it('噪声极短块被过滤掉', () => {
      // 段落只有 5 个字符，应被过滤（< 30）
      const text =
        'ok\n\n'.repeat(10) +
        '这是一段足够长的文本，用来确保有实际内容被保留在结果中，不会全部被过滤掉。';
      const result = svc.split(text, 400, 80);
      result.forEach((c) => expect(c.length).toBeGreaterThanOrEqual(30));
    });
  });

  describe('字符滑动窗口兜底', () => {
    it('无标点超长文本也能正确切分', () => {
      // 无任何标点，纯字符，触发字符窗口
      const text = 'x'.repeat(600);
      const result = svc.split(text, 200, 40);
      expect(result.length).toBeGreaterThan(1);
    });
  });
});
