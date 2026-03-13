import { ChatSourceDto } from './chat-source.dto.js';

export class ChatAnswerDto {
  answer: string;
  sources: ChatSourceDto[];

  constructor(partial: Partial<ChatAnswerDto>) {
    this.answer = partial.answer ?? '';
    this.sources = partial.sources ?? [];
  }
}
