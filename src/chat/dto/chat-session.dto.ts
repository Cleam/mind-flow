export class ChatSessionDto {
  /** 会话 ID */
  sessionId!: string;
  /** 会话创建时间（ISO 字符串） */
  createdAt!: string;

  constructor(init: ChatSessionDto) {
    Object.assign(this, init);
  }
}
