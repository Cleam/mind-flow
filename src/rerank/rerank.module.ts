import { Module } from '@nestjs/common';
import { RerankService } from './rerank.service.js';
import { RerankController } from './rerank.controller.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';

@Module({
  controllers: [RerankController],
  providers: [LlmProviderFactory, RerankService],
  exports: [RerankService],
})
export class RerankModule {}
