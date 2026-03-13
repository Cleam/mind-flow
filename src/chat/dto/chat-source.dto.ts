export class ChatSourceDto {
  chunkId: string;
  source: string;
  score: number;
  chunkIndex: number;

  constructor(partial: Partial<ChatSourceDto>) {
    this.chunkId = partial.chunkId ?? '';
    this.source = partial.source ?? 'unknown';
    this.score = partial.score ?? 0;
    this.chunkIndex = partial.chunkIndex ?? -1;
  }
}
