import { Module } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service.js';

@Module({
  providers: [DocumentParserService],
  exports: [DocumentParserService],
})
export class DocumentParserModule {}
