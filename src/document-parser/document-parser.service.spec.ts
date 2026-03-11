import { BadRequestException } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service.js';

/** 构造一个最小 Multer 文件对象的辅助函数 */
function makeFile(
  originalname: string,
  mimetype: string,
  content: string,
): Express.Multer.File {
  return {
    originalname,
    mimetype,
    buffer: Buffer.from(content, 'utf-8'),
    fieldname: 'files',
    encoding: '7bit',
    size: content.length,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('DocumentParserService', () => {
  const svc = new DocumentParserService();

  describe('txt 解析', () => {
    it('直接返回 UTF-8 内容', async () => {
      const file = makeFile('test.txt', 'text/plain', 'hello world');
      const result = await svc.parseFile(file);
      expect(result.content).toBe('hello world');
      expect(result.format).toBe('txt');
      expect(result.source).toBe('test.txt');
    });
  });

  describe('md 解析', () => {
    it('直接返回 UTF-8 内容（MIME = text/markdown）', async () => {
      const file = makeFile('readme.md', 'text/markdown', '# Title\n\nContent');
      const result = await svc.parseFile(file);
      expect(result.content).toBe('# Title\n\nContent');
      expect(result.format).toBe('md');
    });

    it('直接返回 UTF-8 内容（MIME = text/plain + .md 扩展名）', async () => {
      const file = makeFile('readme.md', 'text/plain', '# Title');
      const result = await svc.parseFile(file);
      // text/plain 会被识别为 txt，但内容应正确返回
      expect(result.content).toBe('# Title');
      expect(result.source).toBe('readme.md');
    });
  });

  describe('不支持的格式', () => {
    it('未知 MIME + 未知扩展名抛出 BadRequestException', async () => {
      const file = makeFile('evil.exe', 'application/octet-stream', 'data');
      await expect(svc.parseFile(file)).rejects.toThrow(BadRequestException);
    });

    it('错误 MIME + 已知合法扩展名（.txt）仍能正常解析', async () => {
      const file = makeFile('a.txt', 'application/octet-stream', 'ok');
      const result = await svc.parseFile(file);
      expect(result.content).toBe('ok');
      expect(result.format).toBe('txt');
    });
  });

  describe('parseMany 批量容错', () => {
    it('单文件解析失败不影响其他文件', async () => {
      const good = makeFile('a.txt', 'text/plain', 'good content');
      const bad = makeFile('evil.exe', 'application/octet-stream', '');

      const { parsed, failures } = await svc.parseMany([good, bad]);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.source).toBe('a.txt');
      expect(failures).toHaveLength(1);
      expect(failures[0]?.source).toBe('evil.exe');
      expect(failures[0]?.fileIndex).toBe(1);
    });

    it('全部成功时 failures 为空', async () => {
      const files = [
        makeFile('a.txt', 'text/plain', 'hello'),
        makeFile('b.md', 'text/markdown', '# Hi'),
      ];
      const { parsed, failures } = await svc.parseMany(files);
      expect(parsed).toHaveLength(2);
      expect(failures).toHaveLength(0);
    });
  });
});
