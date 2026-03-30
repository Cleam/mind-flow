import {
  IsString,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class RerankRequestDto {
  /** 用户查询文本 */
  @IsString()
  query!: string;

  /** 待重排的候选文档列表 */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  documents!: string[];

  /** 返回的重排结果数量上限 */
  @IsOptional()
  @IsInt()
  @Min(1)
  topK?: number;
}
