import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../auth/types/jwt-payload.type';
import { UsersService } from './users.service';
import { SelectActiveTcgDto } from './dto/select-active-tcg.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me/active-tcg')
  @UseGuards(JwtAuthGuard)
  setActiveTcg(@CurrentUser() user: SafeUser, @Body() dto: SelectActiveTcgDto) {
    return this.usersService.setActiveTcgGame(user.id, dto.code);
  }
}
