import { Injectable } from '@nestjs/common';

interface PromptChunk {
  content: string;
  source: string;
  score: number;
}

@Injectable()
export class PromptService {
  /**
   * 构建 RAG 提示词：把检索片段规范化为可引用的参考资料区块。
   * 这里不做业务判断，只负责把上下文组织成“模型易遵循”的固定模板。
   */
  generatePrompt(query: string, retrievedChunks: PromptChunk[]): string {
    let references = '（无）';
    if (retrievedChunks.length) {
      // 将每个片段转换为带编号引用，便于回答阶段追溯来源。
      references = retrievedChunks
        .map(
          (chunk, index) =>
            `[${index + 1}] source=${chunk.source}; score=${chunk.score.toFixed(4)}\n${chunk.content}`,
        )
        .join('\n\n');
    }

    // 固定模板有助于稳定模型行为，降低不同 provider 的输出波动。
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
