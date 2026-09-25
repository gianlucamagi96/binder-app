import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TcgGamesModule } from '../tcg-games/tcg-games.module';

@Module({
  imports: [TcgGamesModule, PassportModule.register({})],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
