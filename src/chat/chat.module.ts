import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { RerankModule } from '../rerank/rerank.module.js';
import { VectorModule } from '../vector/vector.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { PromptService } from './prompt.service.js';

@Module({
  imports: [EmbeddingModule, VectorModule, RerankModule],
  controllers: [ChatController],
  providers: [LlmProviderFactory, PromptService, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
