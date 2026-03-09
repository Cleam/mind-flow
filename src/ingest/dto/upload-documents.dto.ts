import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  Min,
  Validate,
  ValidationArguments,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { UploadDocumentItemDto } from './upload-document-item.dto.js';

@ValidatorConstraint({ name: 'ChunkOptionsConstraint', async: false })
class ChunkOptionsConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const object = args.object as UploadDocumentsDto;
    const chunkSize = object.chunkSize ?? 500;
    const chunkOverlap = object.chunkOverlap ?? 100;
    return chunkOverlap < chunkSize;
  }

  defaultMessage(): string {
    return 'chunkOverlap 必须小于 chunkSize';
  }
}

export class UploadDocumentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UploadDocumentItemDto)
  documents!: UploadDocumentItemDto[];

  @IsInt()
  @Min(1)
  chunkSize = 500;

  @IsInt()
  @Min(0)
  chunkOverlap = 100;

  @Validate(ChunkOptionsConstraint)
  readonly chunkOptionsCheck = true;
}
