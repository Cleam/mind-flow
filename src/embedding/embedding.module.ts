import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';

@Module({
  providers: [LlmProviderFactory, EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
