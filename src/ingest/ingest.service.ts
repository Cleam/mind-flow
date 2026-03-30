import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentParserService } from '../document-parser/document-parser.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { SmartChunkingService } from './smart-chunking.service.js';
import { TextCleanerService } from './text-cleaner.service.js';
import { UploadFilesOptionsDto } from './dto/upload-files-options.dto.js';
import { UploadDocumentsDto } from './dto/upload-documents.dto.js';
import { VectorService } from '../vector/vector.service.js';

export type UploadStatus = 'success' | 'partial' | 'failed';

export interface UploadFailureItem {
  documentIndex: number;
  chunkIndex: number;
  source: string;
  reason: string;
}

export interface UploadDocumentsResult {
  documentCount: number;
  totalChunks: number;
  savedCount: number;
  failedCount: number;
  status: UploadStatus;
  failures: UploadFailureItem[];
}

@Injectable()
export class IngestService {
  private static readonly EMBEDDING_DIMENSION = 1536;
  private static readonly DEFAULT_CHUNK_SIZE = 500;
  private static readonly DEFAULT_CHUNK_OVERLAP = 100;
  private static readonly EMBEDDING_BATCH_SIZE = 16;

  constructor(
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly parserService: DocumentParserService,
    private readonly cleanerService: TextCleanerService,
    private readonly chunkingService: SmartChunkingService,
  ) {}

  /**
   * 测试入库：使用 mock 向量验证存储链路，不依赖真实 Embedding Provider。
   */
  async testIngest(texts: string[]): Promise<{ insertedCount: number }> {
    for (const [index, text] of texts.entries()) {
      const embedding = this.mockEmbedding();
      await this.vectorService.saveChunk(
        text,
        {
          source: 'test-ingest',
          chunkIndex: index,
        },
        embedding,
      );
    }

    return { insertedCount: texts.length };
  }

  /**
   * 字符窗口切片：用于 JSON 直传文本的基础分块。
   * 与 SmartChunkingService 的语义切片不同，此处更强调可预测的长度边界。
   */
  splitText(
    text: string,
    chunkSize = IngestService.DEFAULT_CHUNK_SIZE,
    chunkOverlap = IngestService.DEFAULT_CHUNK_OVERLAP,
  ): string[] {
    // chunk 配置先做边界校验，避免出现死循环或无意义重叠。
    if (chunkSize <= 0) {
      throw new BadRequestException('chunkSize 必须大于 0');
    }

    if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      throw new BadRequestException(
        'chunkOverlap 必须大于等于 0 且小于 chunkSize',
      );
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      return [];
    }

    // 文本较短时直接保留为单块，避免无效切片。
    if (normalizedText.length <= chunkSize) {
      return [normalizedText];
    }

    const step = chunkSize - chunkOverlap;
    const chunks: string[] = [];

    for (let start = 0; start < normalizedText.length; start += step) {
      const end = Math.min(start + chunkSize, normalizedText.length);
      const chunk = normalizedText.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      // 到达末尾后立即退出，避免多一次空循环判断。
      if (end >= normalizedText.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * 处理 JSON 文档上传：按文档切片并累计保存结果。
   */
  async processDocuments(
    body: UploadDocumentsDto,
  ): Promise<UploadDocumentsResult> {
    const failures: UploadFailureItem[] = [];
    let totalChunks = 0;
    let savedCount = 0;
    let failedCount = 0;

    for (const [documentIndex, document] of body.documents.entries()) {
      // source 允许调用方显式指定，缺省时生成稳定兜底名。
      const source =
        document.source?.trim() || `upload-doc-${documentIndex + 1}`;
      const chunks = this.splitText(
        document.content,
        body.chunkSize,
        body.chunkOverlap,
      );

      totalChunks += chunks.length;
      const result = await this.saveDocumentChunks(
        documentIndex,
        source,
        chunks,
        failures,
      );
      savedCount += result.savedCount;
      failedCount += result.failedCount;
    }

    // 状态由 saved/failed 组合推导，保证返回语义一致。
    return {
      documentCount: body.documents.length,
      totalChunks,
      savedCount,
      failedCount,
      status: this.resolveUploadStatus(savedCount, failedCount),
      failures,
    };
  }

  async upload(body: UploadDocumentsDto): Promise<UploadDocumentsResult> {
    return this.processDocuments(body);
  }

  /**
   * 文件上传入库主流程：解析 → 清洗 → 语义切片 → 向量化 → 入库
   * 单文件解析失败不中断批次，结果汇总在 failures 中
   */
  async processFiles(
    files: Express.Multer.File[],
    options: UploadFilesOptionsDto,
  ): Promise<UploadDocumentsResult> {
    // parseMany 内部已做逐文件容错，这里拿到“可处理文件 + 解析失败列表”。
    const { parsed, failures: parseFailures } =
      await this.parserService.parseMany(files);

    // 将解析层失败统一映射到上传失败结构，chunkIndex=-1 表示未进入切片阶段。
    const failures: UploadFailureItem[] = parseFailures.map((f) => ({
      documentIndex: f.fileIndex,
      chunkIndex: -1,
      source: f.source,
      reason: f.reason,
    }));

    let totalChunks = 0;
    let savedCount = 0;
    let failedCount = 0;

    for (const doc of parsed) {
      // 先清洗再切片，减少解析噪声对 embedding 质量的影响。
      const cleaned = this.cleanerService.clean(doc.content);
      const chunks = this.chunkingService.split(
        cleaned,
        options.chunkSize,
        options.chunkOverlap,
      );

      totalChunks += chunks.length;
      const result = await this.saveDocumentChunks(
        doc.fileIndex,
        doc.source,
        chunks,
        failures,
      );
      savedCount += result.savedCount;
      failedCount += result.failedCount;
    }

    // 文件级解析失败也计入失败总数，避免统计口径偏差。
    const totalFailedCount = failedCount + parseFailures.length;
    return {
      documentCount: files.length,
      totalChunks,
      savedCount,
      failedCount: totalFailedCount,
      status: this.resolveUploadStatus(savedCount, totalFailedCount),
      failures,
    };
  }

  private async saveDocumentChunks(
    documentIndex: number,
    source: string,
    chunks: string[],
    failures: UploadFailureItem[],
  ): Promise<{ savedCount: number; failedCount: number }> {
    let savedCount = 0;
    let failedCount = 0;

    // 分批向量化：在吞吐与 provider 稳定性之间取平衡。
    for (
      let batchStart = 0;
      batchStart < chunks.length;
      batchStart += IngestService.EMBEDDING_BATCH_SIZE
    ) {
      const batchChunks = chunks.slice(
        batchStart,
        batchStart + IngestService.EMBEDDING_BATCH_SIZE,
      );

      try {
        const embeddings = await this.embeddingService.batchEmbed(batchChunks);

        // 批量返回数量必须与输入一致，否则无法安全对位写库。
        if (embeddings.length !== batchChunks.length) {
          throw new Error('批量向量化返回数量与文本块数量不一致');
        }

        for (const [offset, chunk] of batchChunks.entries()) {
          const chunkIndex = batchStart + offset;
          const embedding = embeddings[offset];

          try {
            await this.vectorService.saveChunk(
              chunk,
              {
                source,
                documentIndex,
                chunkIndex,
              },
              embedding,
            );

            savedCount += 1;
          } catch (error: unknown) {
            // 单条写库失败不影响同批其它 chunk，记录失败继续处理。
            failedCount += 1;
            failures.push({
              documentIndex,
              chunkIndex,
              source,
              reason: error instanceof Error ? error.message : '未知错误',
            });
          }
        }
      } catch {
        // 批量向量化失败时，自动降级到逐条处理，避免整批丢失。
        for (const [offset, chunk] of batchChunks.entries()) {
          const chunkIndex = batchStart + offset;
          try {
            // 降级路径下逐条向量化，优先保证“部分可成功”。
            const embedding = await this.embeddingService.embed(chunk);
            await this.vectorService.saveChunk(
              chunk,
              {
                source,
                documentIndex,
                chunkIndex,
              },
              embedding,
            );

            savedCount += 1;
          } catch (error: unknown) {
            failedCount += 1;
            failures.push({
              documentIndex,
              chunkIndex,
              source,
              reason: error instanceof Error ? error.message : '未知错误',
            });
          }
        }
      }
    }

    return { savedCount, failedCount };
  }

  private resolveUploadStatus(
    savedCount: number,
    failedCount: number,
  ): UploadStatus {
    // 部分成功与全部失败在上层用户体验上完全不同，需要明确区分。
    if (savedCount > 0 && failedCount === 0) {
      return 'success';
    }

    if (savedCount > 0 && failedCount > 0) {
      return 'partial';
    }

    return 'failed';
  }

  /**
   * 生成固定维度的随机向量，仅用于测试链路，不用于真实语义检索。
   */
  private mockEmbedding(): number[] {
    return Array.from({ length: IngestService.EMBEDDING_DIMENSION }, () =>
      Number(Math.random().toFixed(6)),
    );
  }
}
