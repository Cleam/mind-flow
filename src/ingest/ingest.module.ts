import { Module } from '@nestjs/common';
import { VectorModule } from '../vector/vector.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [VectorModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
