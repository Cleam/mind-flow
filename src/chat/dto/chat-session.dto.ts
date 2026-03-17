export class ChatSessionDto {
  sessionId!: string;
  createdAt!: string;

  constructor(init: ChatSessionDto) {
    Object.assign(this, init);
  }
}
