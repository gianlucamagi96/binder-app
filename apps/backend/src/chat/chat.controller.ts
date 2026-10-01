import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../auth/types/jwt-payload.type';
import { RATE_LIMITS, RateLimitService } from '../rate-limit/rate-limit.service';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatApplyDto } from './dto/chat-apply.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async message(@CurrentUser() user: SafeUser, @Body() dto: ChatMessageDto) {
    if (dto.history && !Array.isArray(dto.history)) {
      throw new BadRequestException('history non valido');
    }
    await this.rateLimit.consume(RATE_LIMITS.chat, user.id);
    return this.chatService.handleMessage(user.id, dto);
  }

  @Post('apply')
  apply(@CurrentUser() user: SafeUser, @Body() dto: ChatApplyDto) {
    return this.chatService.apply(user.id, dto);
  }
}
