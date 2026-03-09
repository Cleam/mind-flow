import {
  IsString,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class RerankRequestDto {
  @IsString()
  query!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  documents!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  topK?: number;
}
