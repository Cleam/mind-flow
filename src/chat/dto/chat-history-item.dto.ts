import type { ChatRole } from '../../generated/prisma/enums.js';

export class ChatHistoryItemDto {
  /** 消息 ID */
  id!: string;
  /** 所属会话 ID */
  sessionId!: string;
  /** 消息角色（user 或 assistant） */
  role!: ChatRole;
  /** 消息正文 */
  content!: string;
  /** 消息创建时间（ISO 字符串） */
  createdAt!: string;

  constructor(init: ChatHistoryItemDto) {
    Object.assign(this, init);
  }
}
