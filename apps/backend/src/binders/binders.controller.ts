import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../auth/types/jwt-payload.type';
import { BindersService } from './binders.service';
import { CreateBinderDto } from './dto/create-binder.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { PageQueryDto } from './dto/page-query.dto';

@Controller('binders')
@UseGuards(JwtAuthGuard)
export class BindersController {
  constructor(private readonly bindersService: BindersService) {}

  @Post()
  create(@CurrentUser() user: SafeUser, @Body() dto: CreateBinderDto) {
    return this.bindersService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: SafeUser) {
    return this.bindersService.findAll(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Query() query: PageQueryDto,
  ) {
    return this.bindersService.findOne(user.id, id, query.page);
  }

  @Post(':id/pages')
  addPage(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.bindersService.addPage(user.id, id);
  }

  @Patch(':id/slots/:slotId')
  updateSlot(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Param('slotId') slotId: string,
    @Body() dto: UpdateSlotDto,
  ) {
    return this.bindersService.updateSlot(user.id, id, slotId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.bindersService.remove(user.id, id);
  }
}
