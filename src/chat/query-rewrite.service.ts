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

  /**
   * 查询改写：将“依赖上下文的追问”改写为“独立可检索的问题”。
   * 失败时必须回退到原问题，保证主链路可用。
   */
  async rewrite(
    currentQuestion: string,
    history: ConversationMessage[],
  ): Promise<string> {
    const question = currentQuestion.trim();
    // 空问题直接原样返回，避免额外调用模型造成噪音与成本。
    if (!question) {
      return currentQuestion;
    }

    // 仅使用最近 6 条消息，平衡上下文有效性与提示词长度。
    const recent = history.slice(-6);
    if (!recent.length) {
      return question;
    }

    const prompt = this.buildPrompt(question, recent);

    try {
      const rewritten = await this.provider.generate(prompt);
      // 清理模型可能返回的包裹引号，避免影响后续检索。
      const normalized = rewritten.trim().replace(/^['"]|['"]$/g, '');
      return normalized || question;
    } catch (error: unknown) {
      // 改写属于增强能力，失败只记日志并降级，不中断问答主流程。
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

  /**
   * 构造改写提示词：明确输出约束，尽量让模型只返回“单行可检索问题”。
   */
  private buildPrompt(
    question: string,
    history: ConversationMessage[],
  ): string {
    // 统一角色文案后拼接编号，便于模型理解多轮语义关系。
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
