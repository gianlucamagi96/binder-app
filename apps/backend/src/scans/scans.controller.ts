import {
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../auth/types/jwt-payload.type';
import { RATE_LIMITS, RateLimitService } from '../rate-limit/rate-limit.service';
import { ScansExceptionFilter } from './scans.exception-filter';
import { ScansService } from './scans.service';

type MemoryFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Controller('scans')
@UseGuards(JwtAuthGuard)
@UseFilters(ScansExceptionFilter)
export class ScansController {
  constructor(
    private readonly scans: ScansService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 6 * 1024 * 1024 },
    }),
  )
  async create(@CurrentUser() user: SafeUser, @UploadedFile() file: MemoryFile) {
    await this.rateLimit.consume(RATE_LIMITS.scan, user.id);
    return this.scans.scan(file);
  }
}
