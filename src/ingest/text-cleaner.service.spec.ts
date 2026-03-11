import { TextCleanerService } from './text-cleaner.service.js';

describe('TextCleanerService', () => {
  const svc = new TextCleanerService();

  it('统一 CRLF 换行符', () => {
    expect(svc.clean('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('统一 CR 换行符', () => {
    expect(svc.clean('a\rb')).toBe('a\nb');
  });

  it('修复 PDF 软连字符断行（英文小写字母）', () => {
    expect(svc.clean('foo-\nbar')).toBe('foobar');
  });

  it('修复 PDF 软连字符断行（中文字符）', () => {
    expect(svc.clean('人-\n工')).toBe('人工');
  });

  it('规范化非断行空格为普通空格', () => {
    expect(svc.clean('a\u00a0b')).toBe('a b');
  });

  it('去除 null bytes', () => {
    expect(svc.clean('a\0b')).toBe('ab');
  });

  it('压缩连续 3+ 空行为 2 个', () => {
    const result = svc.clean('a\n\n\n\n\nb');
    expect(result).toBe('a\n\nb');
  });

  it('修剪行尾空白', () => {
    expect(svc.clean('hello   \nworld   ')).toBe('hello\nworld');
  });

  it('整体 trim', () => {
    expect(svc.clean('  \n  hello  \n  ')).toBe('hello');
  });
});
