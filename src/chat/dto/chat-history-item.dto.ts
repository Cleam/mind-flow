import type { ChatRole } from '../../generated/prisma/enums.js';

export class ChatHistoryItemDto {
  id!: string;
  sessionId!: string;
  role!: ChatRole;
  content!: string;
  createdAt!: string;

  constructor(init: ChatHistoryItemDto) {
    Object.assign(this, init);
  }
}
