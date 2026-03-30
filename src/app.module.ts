import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IngestModule } from './ingest/ingest.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { VectorModule } from './vector/vector.module.js';
import { RerankModule } from './rerank/rerank.module.js';
import { LoggerModule } from './logger/logger.module.js';
import { ChatModule } from './chat/chat.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LoggerModule,
    VectorModule,
    IngestModule,
    RerankModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
