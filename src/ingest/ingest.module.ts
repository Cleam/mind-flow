import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { VectorModule } from '../vector/vector.module.js';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';

@Module({
  imports: [VectorModule, EmbeddingModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
