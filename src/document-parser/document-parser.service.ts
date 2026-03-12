import { BadRequestException, Injectable } from '@nestjs/common';

// 支持的文件格式
export type SupportedFormat = 'pdf' | 'docx' | 'md' | 'txt';

export interface ParsedDocument {
  /** 原始文件名（用作 source） */
  source: string;
  /** 解析出的纯文本内容 */
  content: string;
  /** 文件格式 */
  format: SupportedFormat;
  /** 解析过程产生的非致命警告 */
  parseWarnings: string[];
}

export interface ParseResult {
  /** 成功解析的文档，保留原始文件下标 */
  parsed: Array<ParsedDocument & { fileIndex: number }>;
  /** 解析失败的文件 */
  failures: Array<{ fileIndex: number; source: string; reason: string }>;
}

// MIME 类型 → format 映射（浏览器/client 可能对 .md 发送 text/plain，均接受）
const MIME_MAP: Record<string, SupportedFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
};

// 扩展名 → format 映射（MIME 无法识别时回退）
const EXT_MAP: Record<string, SupportedFormat> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'txt',
  '.md': 'md',
};

@Injectable()
export class DocumentParserService {
  /**
   * 批量解析上传文件，单文件失败不中断批次
   */
  async parseMany(files: Express.Multer.File[]): Promise<ParseResult> {
    const parsed: ParseResult['parsed'] = [];
    const failures: ParseResult['failures'] = [];

    for (const [fileIndex, file] of files.entries()) {
      try {
        const doc = await this.parseFile(file);
        parsed.push({ ...doc, fileIndex });
      } catch (error) {
        failures.push({
          fileIndex,
          source: file.originalname,
          reason: error instanceof Error ? error.message : '未知解析错误',
        });
      }
    }

    return { parsed, failures };
  }

  async parseFile(file: Express.Multer.File): Promise<ParsedDocument> {
    const format = this.detectFormat(file);
    const parseWarnings: string[] = [];
    let content: string;

    switch (format) {
      case 'pdf':
        content = await this.parsePdf(file.buffer, parseWarnings);
        break;
      case 'docx':
        content = await this.parseDocx(file.buffer, parseWarnings);
        break;
      case 'md':
      case 'txt':
        content = file.buffer.toString('utf-8');
        break;
    }

    return { source: file.originalname, content, format, parseWarnings };
  }

  private detectFormat(file: Express.Multer.File): SupportedFormat {
    const byMime = MIME_MAP[file.mimetype];
    if (byMime) return byMime;

    // 按扩展名回退（客户端可能 MIME 不标准）
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    const byExt = EXT_MAP[ext];
    if (byExt) return byExt;

    throw new BadRequestException(
      `不支持的文件类型: ${file.mimetype}（${file.originalname}）。` +
        `支持格式：pdf、docx、md、txt`,
    );
  }

  /** 使用 pdf-parse 提取 PDF 文本 */
  private async parsePdf(buffer: Buffer, warnings: string[]): Promise<string> {
    let parser: {
      getText: () => Promise<{ text: string; total?: number }>;
      destroy?: () => Promise<void> | void;
    } | null = null;
    try {
      const { PDFParse } = await import('pdf-parse');
      parser = new PDFParse({ data: buffer });

      const result = await parser.getText();
      if (result.total === 0) {
        warnings.push('PDF 无内容页');
      }
      return result.text;
    } catch (error) {
      throw new BadRequestException(
        `PDF 解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    } finally {
      await parser?.destroy?.();
    }
  }

  /** 使用 mammoth 提取 DOCX 文本 */
  private async parseDocx(buffer: Buffer, warnings: string[]): Promise<string> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      if (result.messages.length > 0) {
        warnings.push(...result.messages.map((m) => m.message));
      }
      return result.value;
    } catch (error) {
      throw new BadRequestException(
        `DOCX 解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }
}
