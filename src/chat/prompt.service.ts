import { Injectable } from '@nestjs/common';

interface PromptChunk {
  content: string;
  source: string;
  score: number;
}

@Injectable()
export class PromptService {
  generatePrompt(query: string, retrievedChunks: PromptChunk[]): string {
    const references = retrievedChunks.length
      ? retrievedChunks
          .map(
            (chunk, index) =>
              `[${index + 1}] source=${chunk.source}; score=${chunk.score.toFixed(4)}\n${chunk.content}`,
          )
          .join('\n\n')
      : '（无）';

    return [
      '你是一个知识库问答助手。',
      '你必须只根据以下【参考资料】回答问题。',
      '若资料中无相关信息，请直接回答"不了解"。',
      '',
      '【参考资料】',
      references,
      '',
      '【问题】',
      query,
      '',
      '【回答要求】',
      '1. 不要编造资料中不存在的信息。',
      '2. 回答简洁清晰。',
      '3. 若信息不足，仅回答"不了解"。',
    ].join('\n');
  }
}
