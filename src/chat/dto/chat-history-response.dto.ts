import { ChatHistoryItemDto } from './chat-history-item.dto.js';

export class ChatHistoryResponseDto {
  sessionId!: string;
  limit!: number;
  offset!: number;
  items!: ChatHistoryItemDto[];

  constructor(init: ChatHistoryResponseDto) {
    Object.assign(this, init);
  }
}
