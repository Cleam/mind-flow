import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadDocumentItemDto {
  /** 文档正文内容 */
  @IsString()
  @IsNotEmpty()
  content!: string;

  /** 文档来源标识，未传时由服务端兜底 */
  @IsOptional()
  @IsString()
  source?: string;
}
