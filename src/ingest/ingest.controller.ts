import { Body, Controller, Post } from '@nestjs/common';
import { TestIngestDto } from './dto/test-ingest.dto.js';
import { IngestService } from './ingest.service.js';

@Controller()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('test-ingest')
  async testIngest(
    @Body() body: TestIngestDto,
  ): Promise<{ insertedCount: number }> {
    return this.ingestService.testIngest(body.texts);
  }
}
