import { Injectable } from '@nestjs/common';

@Injectable()
export class TextCleanerService {
  /**
   * 清洗从文件解析出的原始文本：
   * 1. 统一换行符（CRLF/CR → LF）
   * 2. 修复 PDF 常见断行（"foo-\nbar" → "foobar"）
   * 3. 规范化非断行空格
   * 4. 去除空字节
   * 5. 压缩连续空行（≥3 → 2）
   * 6. 修剪行尾空白
   */
  clean(text: string): string {
    return (
      text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // 修复 PDF 软连字符断行：行末连字符 + 换行 + 小写字母 → 合并
        .replace(/-\n([a-z\u4e00-\u9fff])/g, '$1')
        // 规范化 NBSP 为普通空格
        .replace(/\u00a0/g, ' ')
        // 去除 null bytes
        .replace(/\0/g, '')
        // 3 个以上空行压缩为 2 个
        .replace(/\n{3,}/g, '\n\n')
        // 修剪每行行尾空白
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .trim()
    );
  }
}
