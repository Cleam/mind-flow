import { IsString, MinLength } from 'class-validator';
import { AskDto } from './ask.dto.js';

export class AskWithSessionDto extends AskDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}
