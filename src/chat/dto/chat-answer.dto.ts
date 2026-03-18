import { ChatSourceDto } from './chat-source.dto.js';

export class ChatAnswerDto {
  /** LLM 最终回答文本 */
  answer: string;
  /** 回答所引用的知识片段来源列表 */
  sources: ChatSourceDto[];

  constructor(partial: Partial<ChatAnswerDto>) {
    this.answer = partial.answer ?? '';
    this.sources = partial.sources ?? [];
  }
}
