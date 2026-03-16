import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TestIngestDto } from './dto/test-ingest.dto.js';
import { UploadDocumentsDto } from './dto/upload-documents.dto.js';
import { UploadFilesOptionsDto } from './dto/upload-files-options.dto.js';
import { IngestService, UploadDocumentsResult } from './ingest.service.js';
import { RequestTimeout } from '../common/decorators/request-timeout.decorator.js';

/** 允许上传的 MIME 类型（浏览器对 .md 可能发 text/plain，一并接受） */
const ALLOWED_MIME_REGEX =
  /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/(plain|markdown|x-markdown))$/;

/** 单文件大小上限：20 MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 文件上传入库可能耗时较长，单独放宽超时 */
const UPLOAD_FILES_TIMEOUT_MS = 600_000;

@Controller()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('test-ingest')
  async testIngest(
    @Body() body: TestIngestDto,
  ): Promise<{ insertedCount: number }> {
    return this.ingestService.testIngest(body.texts);
  }

  @Post('upload')
  async upload(
    @Body() body: UploadDocumentsDto,
  ): Promise<UploadDocumentsResult> {
    return this.ingestService.processDocuments(body);
  }

  /**
   * POST /upload-files
   * multipart/form-data 文件上传接口
   * 支持格式：pdf、docx、md、txt
   * 单文件 ≤ 20MB，单次最多 10 个文件
   * 可选 form 字段：chunkSize（默认 400）、chunkOverlap（默认 80）
   */
  @Post('upload-files')
  @RequestTimeout(UPLOAD_FILES_TIMEOUT_MS)
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() options: UploadFilesOptionsDto,
  ): Promise<UploadDocumentsResult> {
    this.validateFiles(files);
    return this.ingestService.processFiles(files, options);
  }

  private validateFiles(files: Express.Multer.File[] | undefined): void {
    if (!files || files.length === 0) {
      throw new BadRequestException('至少上传一个文件');
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `${file.originalname} 超过大小限制（最大 20MB）`,
        );
      }

      if (!ALLOWED_MIME_REGEX.test(file.mimetype)) {
        throw new BadRequestException(
          `${file.originalname} 文件类型不受支持：${file.mimetype}`,
        );
      }
    }
  }
}
