import { Type } from 'class-transformer';
import {
  IsInt,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'FileUploadChunkOptionsConstraint', async: false })
class FileUploadChunkOptionsConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as UploadFilesOptionsDto;
    const size = obj.chunkSize ?? 400;
    const overlap = obj.chunkOverlap ?? 80;
    return overlap < size;
  }

  defaultMessage(): string {
    return 'chunkOverlap 必须小于 chunkSize';
  }
}

/** 文件上传接口的可选切片参数（multipart form 字段） */
export class UploadFilesOptionsDto {
  /** 每个 chunk 的最大字符数，默认 400（中英混合场景最佳实践） */
  @IsInt()
  @Min(1)
  @Type(() => Number)
  chunkSize = 400;

  /** 相邻 chunk 的重叠字符数，默认 80（约 20%），有助于跨块检索 */
  @IsInt()
  @Min(0)
  @Type(() => Number)
  chunkOverlap = 80;

  /** 触发跨字段校验：要求 chunkOverlap < chunkSize */
  @Validate(FileUploadChunkOptionsConstraint)
  readonly chunkOptionsCheck = true;
}
