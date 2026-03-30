import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class StreamQueryDto {
  /** 会话 ID，用于承载上下文与写入历史 */
  @IsString()
  @MinLength(1)
  sessionId!: string;

  /** 本轮用户问题 */
  @IsString()
  @MinLength(1)
  question!: string;

  /** 召回文档数量上限，范围 1-10 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;

  /** 相似度阈值，范围 0-1 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number;
}
