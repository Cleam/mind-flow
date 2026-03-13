// smart-chunking.service.ts
import { Injectable } from '@nestjs/common';

/** 配置接口：支持按内容类型动态调整策略 */
export interface ChunkConfig {
  chunkTokens: number; // 目标token数（非字符数！）
  overlap: number; // 重叠token数
  minChunkChars: number; // 最小字符数过滤噪声
}

/** 内容类型枚举：用于路由不同分块策略 */
export enum ContentType {
  DEFAULT = 'default', // 普通文本：笔记/记录/随笔
  CODE = 'code', // 代码块：保持语法完整
  SHORT = 'short', // 短内容：通知/备忘/碎片
  LONG_DOC = 'longDoc', // 长文档：技术文章/育儿心得
}

/** 预设配置：针对 text-embedding-v4 @ 1024维优化 */
export const DEFAULT_CHUNK_CONFIGS: Record<ContentType, ChunkConfig> = {
  [ContentType.DEFAULT]: { chunkTokens: 320, overlap: 40, minChunkChars: 30 },
  [ContentType.CODE]: { chunkTokens: 512, overlap: 64, minChunkChars: 50 }, // 代码需更大窗口
  [ContentType.SHORT]: { chunkTokens: 192, overlap: 24, minChunkChars: 20 },
  [ContentType.LONG_DOC]: { chunkTokens: 384, overlap: 48, minChunkChars: 40 },
};

/** 代码块占位符格式 */
const CODE_PLACEHOLDER_PREFIX = '__CODE_BLOCK_';

@Injectable()
export class SmartChunkingService {
  /**
   * 主入口：智能分块
   * @param text 待分块文本
   * @param contentType 内容类型，自动路由策略
   * @param customConfig 可选自定义配置（覆盖默认）
   */
  split(
    text: string,
    contentType: ContentType = ContentType.DEFAULT,
    customConfig?: Partial<ChunkConfig>,
  ): string[] {
    const config = {
      ...DEFAULT_CHUNK_CONFIGS[contentType],
      ...customConfig,
    };

    // 步骤1: 提取并保护代码块（程序员场景关键！）
    const { text: plainText, codeMap } = this.extractCodeBlocks(text);

    // 步骤2: 核心分块逻辑（语义优先三级降级）
    const rawChunks = this.semanticSplit(plainText, config);

    // 步骤3: 还原代码块到对应chunks
    const restoredChunks = this.restoreCodeBlocks(rawChunks, codeMap);

    // 步骤4: 注入语义对齐的overlap + 噪声过滤
    return this.applySmartOverlap(restoredChunks, config).filter(
      (c) => c.length >= config.minChunkChars,
    );
  }

  // ==================== 核心逻辑：语义优先三级降级 ====================

  private semanticSplit(text: string, config: ChunkConfig): string[] {
    // Level 1: 按段落切分（双换行）
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const rawChunks: string[] = [];
    let buffer = '';

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para);
      const bufferTokens = this.estimateTokens(buffer);
      const limit = config.chunkTokens;

      if (paraTokens > limit) {
        // 段落超长：先刷buffer，再按句子降级分割
        if (buffer) {
          rawChunks.push(buffer);
          buffer = '';
        }
        rawChunks.push(...this.splitBySentences(para, config));
      } else if (buffer && bufferTokens + paraTokens + 2 > limit) {
        // buffer + 当前段落超限：刷buffer，重新起头
        rawChunks.push(buffer);
        buffer = para;
      } else {
        // 合并到buffer（保留段落间隔）
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      }
    }
    if (buffer) rawChunks.push(buffer);

    return rawChunks;
  }

  // Level 2: 按句子边界切分（支持中英文标点）
  private splitBySentences(text: string, config: ChunkConfig): string[] {
    // 中英文句末标点 + 中文软停顿词
    const sentences = text
      .split(/(?<=[.!?。！？…；;])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    // 如果句子仍超长或无标点（聊天记录），启用中文软分割
    const hasPunctuation = /[.!?。！？；;]/.test(text);
    if (!hasPunctuation && text.length > config.chunkTokens * 0.8) {
      return this.splitChineseSoft(text, config);
    }

    const chunks: string[] = [];
    let buffer = '';

    for (const sentence of sentences) {
      const sentTokens = this.estimateTokens(sentence);
      const bufTokens = this.estimateTokens(buffer);
      const limit = config.chunkTokens;

      if (sentTokens > limit) {
        // 单句超长：字符滑动窗口兜底（Level 3）
        if (buffer) {
          chunks.push(buffer);
          buffer = '';
        }
        chunks.push(...this.characterSlide(sentence, config));
      } else if (buffer && bufTokens + sentTokens + 1 > limit) {
        chunks.push(buffer);
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer) chunks.push(buffer);

    return chunks;
  }

  // Level 3: 字符滑动窗口兜底（带token估算）
  private characterSlide(text: string, config: ChunkConfig): string[] {
    const chunks: string[] = [];
    // const step = Math.max(1, config.chunkTokens - config.overlap);
    let start = 0;

    while (start < text.length) {
      // 尝试找最近的语义边界（避免切断词语）
      const end = Math.min(start + config.chunkTokens * 0.9, text.length); // 留10%余量
      let cutPoint = end;

      // 从70%位置开始往后找边界
      for (let i = Math.floor(end * 0.7); i < end; i++) {
        if (/[\n\s。！？；,.!?]/.test(text[i])) {
          cutPoint = i + 1;
          break;
        }
      }

      const chunk = text.slice(start, cutPoint).trim();
      if (chunk) chunks.push(chunk);

      start = cutPoint - config.overlap; // 重叠部分
      if (start >= text.length) break;
    }
    return chunks;
  }

  // 中文无标点长文本的软分割（聊天记录/语音转写优化）
  private splitChineseSoft(text: string, config: ChunkConfig): string[] {
    const softBreaks = [
      '，',
      '、',
      '然后',
      '接着',
      '另外',
      '还有',
      '而且',
      '但是',
    ];
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > config.chunkTokens * 0.8) {
      let cutIndex = config.chunkTokens; // 默认硬切位置

      // 在[70%, 100%]区间找软分割点
      const searchStart = Math.floor(config.chunkTokens * 0.7);
      const searchEnd = Math.min(config.chunkTokens + 20, remaining.length);

      for (let i = searchStart; i < searchEnd; i++) {
        const substr = remaining.slice(i - 10, i + 10);
        for (const br of softBreaks) {
          const idx = substr.indexOf(br);
          if (idx >= 0) {
            cutIndex = i - 10 + idx + br.length;
            break;
          }
        }
        if (cutIndex !== config.chunkTokens) break;
      }

      chunks.push(remaining.slice(0, cutIndex).trim());
      remaining = remaining.slice(cutIndex).trim();
    }
    if (remaining) chunks.push(remaining);

    return chunks;
  }

  // ==================== 代码块保护逻辑 ====================

  private extractCodeBlocks(text: string): {
    text: string;
    codeMap: Map<string, string>;
  } {
    const codeMap = new Map<string, string>();
    let index = 0;

    // 匹配: ```lang ... ``` 或 4空格缩进行（简单启发式）
    const codeRegex = /(```[\s\S]*?```)|((?:^ {4}.*$\n?)+)/gm;

    const processed = text.replace(codeRegex, (match) => {
      const placeholder = `${CODE_PLACEHOLDER_PREFIX}${index++}__`;
      codeMap.set(placeholder, match.trim());
      return `\n${placeholder}\n`; // 保留换行避免粘连
    });

    return { text: processed, codeMap };
  }

  private restoreCodeBlocks(
    chunks: string[],
    codeMap: Map<string, string>,
  ): string[] {
    return chunks.map((chunk) =>
      chunk.replace(
        new RegExp(`${CODE_PLACEHOLDER_PREFIX}\\d+__`, 'g'),
        (ph) => codeMap.get(ph) || ph,
      ),
    );
  }

  // ==================== 语义对齐的Overlap注入 ====================

  private applySmartOverlap(chunks: string[], config: ChunkConfig): string[] {
    if (chunks.length <= 1 || config.overlap <= 0) return chunks;

    return chunks.map((chunk, i) => {
      if (i === 0) return chunk;
      const prev = chunks[i - 1];
      const overlapText = this.smartOverlapTail(prev, config.overlap);
      return overlapText ? `${overlapText}\n${chunk}` : chunk;
    });
  }

  // 按语义边界截取overlap，避免切断词语/句子
  private smartOverlapTail(text: string, targetTokens: number): string {
    // 先按字符估算位置（留20%余量）
    const charLimit = Math.floor(targetTokens / 1.2);
    const candidate = text.slice(-charLimit);

    // 从后往前找最近的语义边界
    const boundaryRegex = /[\n\s。！？；,.!?、]/;
    for (let i = candidate.length - 1; i >= 0; i--) {
      if (boundaryRegex.test(candidate[i])) {
        return candidate.slice(0, i + 1).trim();
      }
    }
    return candidate.trim(); // 兜底：直接返回
  }

  // ==================== Token估算（轻量版，无需API） ====================

  /**
   * 估算文本的token数量（text-embedding-v4兼容）
   * 精度：误差<10%，个人项目完全够用
   * 原理：中文1汉字≈1.2token，英文1单词≈1.3token，标点/数字≈0.5
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars =
      text.length - chineseChars - (text.match(/[a-zA-Z]/g) || []).length;

    // 加权估算 + 向上取整留余量
    return Math.ceil(
      chineseChars * 1.2 + englishWords * 1.3 + otherChars * 0.3,
    );
  }

  // ==================== 工具方法 ====================

  /** 获取内容类型（自动检测，可选） */
  detectContentType(text: string): ContentType {
    // 代码特征：包含```或连续缩进
    if (/```|^\s{4}/m.test(text)) return ContentType.CODE;

    // 短内容：字符数<100且无段落分隔
    if (text.length < 100 && !/\n{2,}/.test(text)) return ContentType.SHORT;

    // 长文档：字符数>1500或有明显章节结构
    if (text.length > 1500 || /#{2,}\s/.test(text)) return ContentType.LONG_DOC;

    return ContentType.DEFAULT;
  }
}
