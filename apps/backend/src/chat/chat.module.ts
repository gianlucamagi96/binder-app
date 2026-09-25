import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { BindersModule } from '../binders/binders.module';
import { CatalogModule } from '../catalog/catalog.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    CatalogModule,
    BindersModule,
    WishlistModule,
    PassportModule.register({}),
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
