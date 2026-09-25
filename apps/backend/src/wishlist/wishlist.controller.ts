import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../auth/types/jwt-payload.type';
import { WishlistService } from './wishlist.service';
import {
  AddWishlistItemDto,
  CreateWishlistDto,
  UpdateWishlistDto,
} from './dto/wishlist.dto';

@Controller('wishlists')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@CurrentUser() user: SafeUser) {
    return this.wishlistService.listWishlists(user.id);
  }

  @Post()
  create(@CurrentUser() user: SafeUser, @Body() dto: CreateWishlistDto) {
    return this.wishlistService.createWishlist(user.id, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.wishlistService.getWishlist(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() dto: UpdateWishlistDto,
  ) {
    return this.wishlistService.updateWishlist(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.wishlistService.deleteWishlist(user.id, id);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() dto: AddWishlistItemDto,
  ) {
    return this.wishlistService.addItem(user.id, id, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.wishlistService.removeItem(user.id, id, itemId);
  }

  @Post(':id/bulk-from-binder/:binderId')
  bulkFromBinder(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Param('binderId') binderId: string,
  ) {
    return this.wishlistService.bulkFromBinder(user.id, id, binderId);
  }
}
