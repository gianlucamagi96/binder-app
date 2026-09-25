import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TcgdexService } from '../catalog/tcgdex.service';
import {
  AddWishlistItemDto,
  CreateWishlistDto,
  UpdateWishlistDto,
} from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tcgdexService: TcgdexService,
  ) {}

  async listWishlists(userId: string) {
    const wishlists = await this.prisma.wishlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          orderBy: { createdAt: 'desc' },
          take: 4,
        },
        _count: { select: { items: true } },
      },
    });

    return Promise.all(
      wishlists.map(async (wishlist) => ({
        id: wishlist.id,
        name: wishlist.name,
        createdAt: wishlist.createdAt,
        updatedAt: wishlist.updatedAt,
        itemCount: wishlist._count.items,
        coverImages: (
          await Promise.all(
            wishlist.items.map(async (item) => {
              const card = await this.tcgdexService.getCardDetail(item.tcgdexCardId);
              return card?.image ?? null;
            }),
          )
        ).filter((image): image is string => Boolean(image)),
      })),
    );
  }

  async createWishlist(userId: string, dto: CreateWishlistDto) {
    const wishlist = await this.prisma.wishlist.create({
      data: { userId, name: dto.name.trim() },
    });
    return {
      id: wishlist.id,
      name: wishlist.name,
      createdAt: wishlist.createdAt,
      updatedAt: wishlist.updatedAt,
      itemCount: 0,
      coverImages: [] as string[],
    };
  }

  async getWishlist(userId: string, wishlistId: string) {
    const wishlist = await this.findOwnedWishlist(userId, wishlistId);
    const items = await this.prisma.wishlistItem.findMany({
      where: { wishlistId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: wishlist.id,
      name: wishlist.name,
      createdAt: wishlist.createdAt,
      updatedAt: wishlist.updatedAt,
      items: await Promise.all(items.map((item) => this.toEnrichedItem(item))),
    };
  }

  async updateWishlist(
    userId: string,
    wishlistId: string,
    dto: UpdateWishlistDto,
  ) {
    await this.findOwnedWishlist(userId, wishlistId);
    const wishlist = await this.prisma.wishlist.update({
      where: { id: wishlistId },
      data: { name: dto.name.trim() },
    });
    return {
      id: wishlist.id,
      name: wishlist.name,
      createdAt: wishlist.createdAt,
      updatedAt: wishlist.updatedAt,
    };
  }

  async deleteWishlist(userId: string, wishlistId: string) {
    await this.findOwnedWishlist(userId, wishlistId);
    await this.prisma.wishlist.delete({ where: { id: wishlistId } });
    return { success: true };
  }

  // Idempotente sulla coppia (wishlistId, tcgdexCardId).
  async addItem(userId: string, wishlistId: string, dto: AddWishlistItemDto) {
    await this.findOwnedWishlist(userId, wishlistId);

    const item = await this.prisma.wishlistItem.upsert({
      where: {
        wishlistId_tcgdexCardId: {
          wishlistId,
          tcgdexCardId: dto.tcgdexCardId,
        },
      },
      create: {
        wishlistId,
        tcgdexCardId: dto.tcgdexCardId,
        note: dto.note ?? null,
      },
      update: {
        note: dto.note !== undefined ? dto.note : undefined,
      },
    });

    return this.toEnrichedItem(item);
  }

  async removeItem(userId: string, wishlistId: string, itemId: string) {
    await this.findOwnedWishlist(userId, wishlistId);
    const item = await this.prisma.wishlistItem.findFirst({
      where: { id: itemId, wishlistId },
    });
    if (!item) {
      throw new NotFoundException('Voce wishlist non trovata');
    }
    await this.prisma.wishlistItem.delete({ where: { id: itemId } });
    return { success: true };
  }

  async bulkFromBinder(
    userId: string,
    wishlistId: string,
    binderId: string,
  ) {
    await this.findOwnedWishlist(userId, wishlistId);

    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
      include: {
        pages: { include: { slots: true } },
      },
    });
    if (!binder) {
      throw new NotFoundException('Binder non trovato');
    }
    if (binder.type !== 'EXPANSION' && binder.type !== 'ARTIST') {
      throw new BadRequestException(
        'Il bulk wishlist è disponibile solo per binder checklist (espansione o artista)',
      );
    }

    const missingCardIds = [
      ...new Set(
        binder.pages
          .flatMap((page) => page.slots)
          .filter((slot) => slot.tcgdexCardId && slot.quantity === 0)
          .map((slot) => slot.tcgdexCardId as string),
      ),
    ];

    if (missingCardIds.length === 0) {
      return { added: 0, total: 0 };
    }

    const result = await this.prisma.wishlistItem.createMany({
      data: missingCardIds.map((tcgdexCardId) => ({
        wishlistId,
        tcgdexCardId,
      })),
      skipDuplicates: true,
    });

    return { added: result.count, total: missingCardIds.length };
  }

  /** Restituisce la prima wishlist dell'utente, creandone una di default se serve. */
  async ensureDefaultWishlist(userId: string) {
    const existing = await this.prisma.wishlist.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;

    return this.prisma.wishlist.create({
      data: { userId, name: 'Wishlist' },
    });
  }

  private async findOwnedWishlist(userId: string, wishlistId: string) {
    const wishlist = await this.prisma.wishlist.findFirst({
      where: { id: wishlistId, userId },
    });
    if (!wishlist) {
      throw new NotFoundException('Wishlist non trovata');
    }
    return wishlist;
  }

  private async toEnrichedItem(item: {
    id: string;
    wishlistId: string;
    tcgdexCardId: string;
    note: string | null;
    createdAt: Date;
  }) {
    return {
      id: item.id,
      wishlistId: item.wishlistId,
      tcgdexCardId: item.tcgdexCardId,
      note: item.note,
      createdAt: item.createdAt,
      card: await this.tcgdexService.getCardDetail(item.tcgdexCardId),
    };
  }
}
