import { IsString, MinLength } from 'class-validator';
import { AskDto } from './ask.dto.js';

export class AskWithSessionDto extends AskDto {
  /** 会话 ID，用于多轮上下文关联 */
  @IsString()
  @MinLength(1)
  sessionId!: string;
}
