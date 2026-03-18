import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class TestIngestDto {
  /** 待写入向量库的原始文本数组 */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  texts!: string[];
}
