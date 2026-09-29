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
  constructor(private readonly scans: ScansService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 6 * 1024 * 1024 },
    }),
  )
  create(@UploadedFile() file: MemoryFile) {
    return this.scans.scan(file);
  }
}
