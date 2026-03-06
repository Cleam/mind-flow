import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class TestIngestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  texts!: string[];
}
