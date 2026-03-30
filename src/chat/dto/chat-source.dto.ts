export class ChatSourceDto {
  /** 被引用切片的唯一标识 */
  chunkId: string;
  /** 切片来源（文件名或业务来源名） */
  source: string;
  /** 该切片与问题的相关性分数 */
  score: number;
  /** 切片在源文档内的序号 */
  chunkIndex: number;

  constructor(partial: Partial<ChatSourceDto>) {
    this.chunkId = partial.chunkId ?? '';
    this.source = partial.source ?? 'unknown';
    this.score = partial.score ?? 0;
    this.chunkIndex = partial.chunkIndex ?? -1;
  }
}
