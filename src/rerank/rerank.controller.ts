import { Body, Controller, Post } from '@nestjs/common';
import { RerankService } from './rerank.service.js';
import { RerankRequestDto } from './dto/rerank-request.dto.js';
import { RerankResultDto } from './dto/rerank-result.dto.js';

@Controller('rerank')
export class RerankController {
  constructor(private readonly rerankService: RerankService) {}

  @Post()
  async rerank(@Body() body: RerankRequestDto): Promise<RerankResultDto> {
    const results = await this.rerankService.rerank(
      body.query,
      body.documents,
      body.topK,
    );

    return new RerankResultDto(body.query, results);
  }
}
