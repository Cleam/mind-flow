import { Injectable } from '@nestjs/common';

/** 低于此长度的 chunk 视为噪声，直接丢弃 */
const MIN_CHUNK_LENGTH = 30;

@Injectable()
export class SmartChunkingService {
  /**
   * 语义优先切片：段落优先 → 句子回退 → 字符窗口兜底
   *
   * 策略：
   * 1. 按双换行拆成段落，合并短段落直到接近 chunkSize
   * 2. 超长段落按句子边界继续分割
   * 3. 超长句子用字符滑动窗口兜底
   * 4. 相邻 chunks 之间追加 overlap 字符以保留跨块上下文
   * 5. 过滤长度 < MIN_CHUNK_LENGTH 的噪声块
   */
  split(text: string, chunkSize = 400, overlap = 80): string[] {
    // 拆成段落，过滤纯空白
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const rawChunks: string[] = [];
    let buffer = '';

    for (const para of paragraphs) {
      if (para.length > chunkSize) {
        // 段落超长：先刷 buffer，再按句子分割
        if (buffer) {
          rawChunks.push(buffer);
          buffer = '';
        }
        rawChunks.push(...this.splitBySentences(para, chunkSize, overlap));
      } else if (buffer && buffer.length + para.length + 2 > chunkSize) {
        // buffer + 当前段落会超限：刷 buffer，重新起头
        rawChunks.push(buffer);
        buffer = para;
      } else {
        // 合并到 buffer
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      }
    }
    if (buffer) rawChunks.push(buffer);

    // 在相邻 chunk 之间注入 overlap，增强跨块检索召回
    return this.applyOverlap(rawChunks, overlap).filter(
      (c) => c.length >= MIN_CHUNK_LENGTH,
    );
  }

  /**
   * 按句子边界切分（支持中英文标点）
   * 句子仍超长时回退到字符窗口
   */
  private splitBySentences(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    // 中英文句末标点后切分
    const sentences = text
      .split(/(?<=[.!?。！？…；;])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let buffer = '';

    for (const sentence of sentences) {
      if (sentence.length > chunkSize) {
        // 单句超长：字符窗口兜底
        if (buffer) {
          chunks.push(buffer);
          buffer = '';
        }
        chunks.push(...this.characterSlide(sentence, chunkSize, overlap));
      } else if (buffer && buffer.length + sentence.length + 1 > chunkSize) {
        chunks.push(buffer);
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer) chunks.push(buffer);

    return chunks;
  }

  /** 字符滑动窗口（最后兜底策略） */
  private characterSlide(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];
    const step = Math.max(1, chunkSize - overlap);

    for (let start = 0; start < text.length; start += step) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= text.length) break;
    }
    return chunks;
  }

  /**
   * 在相邻 chunk 间注入 overlap：
   * 将上一个 chunk 的末尾 overlap 字符前置到当前 chunk，
   * 保证跨块检索时上下文不中断
   */
  private applyOverlap(chunks: string[], overlap: number): string[] {
    if (chunks.length <= 1 || overlap <= 0) return chunks;

    return chunks.map((chunk, i) => {
      if (i === 0) return chunk;
      const prev = chunks[i - 1];
      const tail = prev.slice(-overlap).trim();
      return tail ? `${tail}\n${chunk}` : chunk;
    });
  }
}
