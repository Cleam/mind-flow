import { Module } from '@nestjs/common';
import { DocumentParserModule } from '../document-parser/document-parser.module.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { VectorModule } from '../vector/vector.module.js';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';
import { SmartChunkingService } from './smart-chunking.service.js';
import { TextCleanerService } from './text-cleaner.service.js';

@Module({
  imports: [VectorModule, EmbeddingModule, DocumentParserModule],
  controllers: [IngestController],
  providers: [IngestService, TextCleanerService, SmartChunkingService],
})
export class IngestModule {}
