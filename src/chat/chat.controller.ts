import { Body, Controller, Post } from '@nestjs/common';
import { RequestTimeout } from '../common/decorators/request-timeout.decorator.js';
import { AskDto } from './dto/ask.dto.js';
import { ChatAnswerDto } from './dto/chat-answer.dto.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('ask')
  @RequestTimeout(180_000)
  async ask(@Body() body: AskDto): Promise<ChatAnswerDto> {
    return this.chatService.ask(body);
  }
}
