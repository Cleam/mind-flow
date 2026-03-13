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
  private static readonly EMBEDDING_DIMENSION = 1024;
  private static readonly DEFAULT_CHUNK_SIZE = 320;
  private static readonly DEFAULT_CHUNK_OVERLAP = 40;

  constructor(
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly parserService: DocumentParserService,
    private readonly cleanerService: TextCleanerService,
    private readonly chunkingService: SmartChunkingService,
  ) {}

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

  splitText(
    text: string,
    chunkSize = IngestService.DEFAULT_CHUNK_SIZE,
    chunkOverlap = IngestService.DEFAULT_CHUNK_OVERLAP,
  ): string[] {
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

      if (end >= normalizedText.length) {
        break;
      }
    }

    return chunks;
  }

  async processDocuments(
    body: UploadDocumentsDto,
  ): Promise<UploadDocumentsResult> {
    const failures: UploadFailureItem[] = [];
    let totalChunks = 0;
    let savedCount = 0;
    let failedCount = 0;

    for (const [documentIndex, document] of body.documents.entries()) {
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
    const { parsed, failures: parseFailures } =
      await this.parserService.parseMany(files);

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

    for (const [chunkIndex, chunk] of chunks.entries()) {
      try {
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

    return { savedCount, failedCount };
  }

  private resolveUploadStatus(
    savedCount: number,
    failedCount: number,
  ): UploadStatus {
    if (savedCount > 0 && failedCount === 0) {
      return 'success';
    }

    if (savedCount > 0 && failedCount > 0) {
      return 'partial';
    }

    return 'failed';
  }

  private mockEmbedding(): number[] {
    return Array.from({ length: IngestService.EMBEDDING_DIMENSION }, () =>
      Number(Math.random().toFixed(6)),
    );
  }
}
