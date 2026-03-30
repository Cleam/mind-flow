import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ChatHistoryQueryDto {
  /** 需要查询历史消息的会话 ID */
  @IsString()
  @MinLength(1)
  sessionId!: string;

  /** 分页大小，范围 1-100 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** 分页偏移量，从 0 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
