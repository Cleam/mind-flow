import { Injectable } from '@nestjs/common';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { AppLoggerService } from '../logger/logger.service.js';
import type { LlmProvider } from '../llm/providers/base/llm-provider.interface.js';
import type { ConversationMessage } from './conversation.service.js';

@Injectable()
export class QueryRewriteService {
  private readonly provider: LlmProvider;

  constructor(
    providerFactory: LlmProviderFactory,
    private readonly logger: AppLoggerService,
  ) {
    this.provider = providerFactory.createProvider();
  }

  async rewrite(
    currentQuestion: string,
    history: ConversationMessage[],
  ): Promise<string> {
    const question = currentQuestion.trim();
    if (!question) {
      return currentQuestion;
    }

    const recent = history.slice(-6);
    if (!recent.length) {
      return question;
    }

    const prompt = this.buildPrompt(question, recent);

    try {
      const rewritten = await this.provider.generate(prompt);
      const normalized = rewritten.trim().replace(/^['\"]|['\"]$/g, '');
      return normalized || question;
    } catch (error: unknown) {
      this.logger.warn(
        'Query rewrite failed and fallback to original question',
        {
          provider: this.provider.getName(),
          questionPreview: question.slice(0, 200),
          historyCount: recent.length,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      );
      return question;
    }
  }

  private buildPrompt(
    question: string,
    history: ConversationMessage[],
  ): string {
    const historyText = history
      .map((item, index) => {
        const role = item.role === 'assistant' ? '助手' : '用户';
        return `${index + 1}. ${role}: ${item.content}`;
      })
      .join('\n');

    return [
      '你是一个查询改写助手。',
      '任务：结合最近对话上下文，把当前问题改写成一个独立、可检索的问题。',
      '约束：',
      '1. 只输出改写后的问题，不要输出解释。',
      '2. 若当前问题本身已完整清晰，原样返回。',
      '3. 不要编造对话中不存在的信息。',
      '',
      '【最近对话】',
      historyText,
      '',
      '【当前问题】',
      question,
      '',
      '【改写结果】',
    ].join('\n');
  }
}
