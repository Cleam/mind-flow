import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class AskDto {
  /** 用户提问内容，至少 1 个字符 */
  @IsString()
  @MinLength(1)
  question!: string;

  /** 召回文档数量上限，范围 1-10 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;

  /** 相似度阈值，范围 0-1 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number;
}
