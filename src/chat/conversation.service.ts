import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChatRole } from '../generated/prisma/enums.js';

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

@Injectable()
export class ConversationService {
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly MAX_LIMIT = 100;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 持久化单条会话消息，写入前会做 sessionId/content 的基础清洗与校验。
   */
  async saveMessage(
    sessionId: string,
    role: ChatRole,
    content: string,
  ): Promise<void> {
    const safeSessionId = this.normalizeSessionId(sessionId);
    const safeContent = this.normalizeContent(content);

    await this.prisma.chatMessage.create({
      data: {
        sessionId: safeSessionId,
        role,
        content: safeContent,
      },
    });
  }

  /**
   * 分页读取会话历史：数据库按倒序分页，再反转为时间正序返回给上层。
   */
  async getHistory(
    sessionId: string,
    limit = ConversationService.DEFAULT_LIMIT,
    offset = 0,
  ): Promise<ConversationMessage[]> {
    const safeSessionId = this.normalizeSessionId(sessionId);
    const safeLimit = this.normalizeLimit(limit);
    const safeOffset = this.normalizeOffset(offset);

    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId: safeSessionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: safeOffset,
      take: safeLimit,
    });

    return rows.reverse().map((row) => ({
      id: row.id.toString(),
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private normalizeSessionId(sessionId: string): string {
    if (!sessionId?.trim()) {
      throw new BadRequestException('sessionId 不能为空');
    }

    return sessionId.trim();
  }

  private normalizeContent(content: string): string {
    if (!content?.trim()) {
      throw new BadRequestException('content 不能为空');
    }

    return content.trim();
  }

  private normalizeLimit(limit: number): number {
    const value = Math.trunc(limit);
    if (value < 1) {
      return ConversationService.DEFAULT_LIMIT;
    }

    return Math.min(value, ConversationService.MAX_LIMIT);
  }

  private normalizeOffset(offset: number): number {
    return Math.max(0, Math.trunc(offset));
  }
}
