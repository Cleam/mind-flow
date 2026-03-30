import { ChatHistoryItemDto } from './chat-history-item.dto.js';

export class ChatHistoryResponseDto {
  /** 会话 ID */
  sessionId!: string;
  /** 实际分页大小 */
  limit!: number;
  /** 实际分页偏移量 */
  offset!: number;
  /** 当前页历史消息列表 */
  items!: ChatHistoryItemDto[];

  constructor(init: ChatHistoryResponseDto) {
    Object.assign(this, init);
  }
}
