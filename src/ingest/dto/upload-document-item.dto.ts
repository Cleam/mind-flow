import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadDocumentItemDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  source?: string;
}
