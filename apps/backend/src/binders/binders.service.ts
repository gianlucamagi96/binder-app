import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TcgdexService } from '../catalog/tcgdex.service';
import { CreateBinderDto } from './dto/create-binder.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

@Injectable()
export class BindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tcgdexService: TcgdexService,
  ) {}

  async create(userId: string, dto: CreateBinderDto) {
    if (dto.type === 'GAME' && !dto.tcgGameCode) {
      throw new BadRequestException('tcgGameCode è richiesto per i binder di tipo GAME');
    }
    if (dto.type === 'EXPANSION' && (!dto.expansionIds || dto.expansionIds.length === 0)) {
      throw new BadRequestException('Seleziona almeno una espansione');
    }
    if (dto.type === 'ARTIST' && !dto.artistName?.trim()) {
      throw new BadRequestException('Seleziona un artista');
    }

    const artistName = dto.artistName?.trim();
    const artistCards =
      dto.type === 'ARTIST' ? await this.tcgdexService.getIllustratorCards(artistName!) : null;
    if (dto.type === 'ARTIST' && !artistCards) {
      throw new BadRequestException('Artista non trovato');
    }

    const binder = await this.prisma.binder.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        tcgGameCode: dto.type === 'GAME' ? dto.tcgGameCode : null,
        artistName: dto.type === 'ARTIST' ? artistName : null,
        rows: dto.rows,
        cols: dto.cols,
        coverStyle: dto.coverStyle,
      },
    });

    if (dto.type === 'EXPANSION') {
      await this.prisma.binderExpansion.createMany({
        data: dto.expansionIds!.map((expansionId) => ({
          binderId: binder.id,
          tcgdexExpansionId: expansionId,
        })),
      });
      await this.generateExpansionChecklist(
        binder.id,
        dto.expansionIds!,
        dto.rows,
        dto.cols,
      );
    } else if (dto.type === 'ARTIST') {
      await this.generateChecklist(binder.id, artistCards!, dto.rows, dto.cols);
    } else {
      const page = await this.prisma.binderPage.create({
        data: { binderId: binder.id, pageNumber: 1 },
      });
      const slotCount = dto.rows * dto.cols;
      await this.prisma.binderSlot.createMany({
        data: Array.from({ length: slotCount }, (_, position) => ({
          pageId: page.id,
          position,
        })),
      });
    }

    return this.findOne(userId, binder.id, 1);
  }

  // Una sola chiamata TCGdex per espansione (tramite getExpansionSummary,
  // già cachata): il set.get() restituisce già l'elenco completo delle
  // carte, quindi non serve interrogare TCGdex una volta per carta per
  // costruire il checklist. Le espansioni vengono lette in sequenza (non in
  // parallelo) per restare "gentili" con l'API anche quando un binder
  // collega più set contemporaneamente.
  private async generateExpansionChecklist(
    binderId: string,
    expansionIds: string[],
    rows: number,
    cols: number,
  ) {
    const perPage = rows * cols;
    const slotsBuffer: {
      pageId: string;
      position: number;
      tcgdexCardId: string;
    }[] = [];

    let pageNumber = 1;
    let currentPageId: string | null = null;
    let position = 0;

    for (const expansionId of expansionIds) {
      const summary = await this.tcgdexService.getExpansionSummary(expansionId);
      if (!summary) {
        continue; // espansione non trovata su TCGdex: la saltiamo senza far fallire l'intero binder
      }

      for (const card of summary.cards) {
        if (!currentPageId || position >= perPage) {
          const page = await this.prisma.binderPage.create({
            data: { binderId, pageNumber },
          });
          currentPageId = page.id;
          pageNumber += 1;
          position = 0;
        }
        slotsBuffer.push({ pageId: currentPageId, position, tcgdexCardId: card.id });
        position += 1;
      }
    }

    if (slotsBuffer.length > 0) {
      await this.prisma.binderSlot.createMany({ data: slotsBuffer });
    }
  }

  private async generateChecklist(
    binderId: string,
    cardIds: string[],
    rows: number,
    cols: number,
  ) {
    const perPage = rows * cols;
    const slotsBuffer: {
      pageId: string;
      position: number;
      tcgdexCardId: string;
    }[] = [];

    let pageNumber = 1;
    let currentPageId: string | null = null;
    let position = 0;

    for (const cardId of cardIds) {
      if (!currentPageId || position >= perPage) {
        const page = await this.prisma.binderPage.create({
          data: { binderId, pageNumber },
        });
        currentPageId = page.id;
        pageNumber += 1;
        position = 0;
      }
      slotsBuffer.push({ pageId: currentPageId, position, tcgdexCardId: cardId });
      position += 1;
    }

    if (slotsBuffer.length === 0) {
      const page = await this.prisma.binderPage.create({
        data: { binderId, pageNumber: 1 },
      });
      await this.prisma.binderSlot.createMany({
        data: Array.from({ length: perPage }, (_, slotPosition) => ({
          pageId: page.id,
          position: slotPosition,
        })),
      });
      return;
    }

    await this.prisma.binderSlot.createMany({ data: slotsBuffer });
  }

  async findAll(userId: string) {
    const binders = await this.prisma.binder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        expansions: true,
        pages: { include: { slots: true } },
      },
    });

    return Promise.all(binders.map((binder) => this.toListItem(binder)));
  }

  private async toListItem(binder: {
    id: string;
    name: string;
    type: string;
    tcgGameCode: string | null;
    rows: number;
    cols: number;
    coverStyle: string | null;
    createdAt: Date;
    expansions: { tcgdexExpansionId: string }[];
    pages: { slots: { quantity: number; tcgdexCardId: string | null }[] }[];
  }) {
    const allSlots = binder.pages.flatMap((p) => p.slots);
    const totalSlots = allSlots.length;
    const ownedSlots = allSlots.filter((s) => s.quantity >= 1).length;
    const completion =
      (binder.type === 'EXPANSION' || binder.type === 'ARTIST') && totalSlots > 0
        ? ownedSlots / totalSlots
        : null;

    let coverImage: string | null = null;
    let coverLogo: string | null = null;

    if (binder.type === 'EXPANSION' || binder.type === 'ARTIST') {
      const ownedWithCard = allSlots.find((s) => s.quantity >= 1 && s.tcgdexCardId);
      if (ownedWithCard?.tcgdexCardId) {
        const card = await this.tcgdexService.getCardDetail(ownedWithCard.tcgdexCardId);
        coverImage = card?.image ?? null;
      }
      if (!coverImage && binder.expansions[0]) {
        const summary = await this.tcgdexService.getExpansionSummary(
          binder.expansions[0].tcgdexExpansionId,
        );
        coverLogo = summary?.logo ?? null;
      }
    }

    return {
      id: binder.id,
      name: binder.name,
      type: binder.type,
      tcgGameCode: binder.tcgGameCode,
      rows: binder.rows,
      cols: binder.cols,
      coverStyle: binder.coverStyle,
      createdAt: binder.createdAt,
      totalPages: binder.pages.length,
      completion,
      cover: { image: coverImage, logo: coverLogo },
    };
  }

  async findOne(userId: string, binderId: string, pageParam?: number) {
    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
      include: { expansions: true },
    });
    if (!binder) {
      throw new NotFoundException('Binder non trovato');
    }

    const totalPages = await this.prisma.binderPage.count({
      where: { binderId },
    });
    const pageNumber = Math.min(Math.max(pageParam ?? 1, 1), Math.max(totalPages, 1));

    const page = await this.prisma.binderPage.findFirst({
      where: { binderId, pageNumber },
      include: { slots: { orderBy: { position: 'asc' } } },
    });

    const slots = await Promise.all(
      (page?.slots ?? []).map(async (slot) => ({
        id: slot.id,
        position: slot.position,
        tcgdexCardId: slot.tcgdexCardId,
        quantity: slot.quantity,
        condition: slot.condition,
        card: slot.tcgdexCardId
          ? await this.tcgdexService.getCardDetail(slot.tcgdexCardId)
          : null,
      })),
    );

    return {
      id: binder.id,
      name: binder.name,
      type: binder.type,
      tcgGameCode: binder.tcgGameCode,
      rows: binder.rows,
      cols: binder.cols,
      coverStyle: binder.coverStyle,
      createdAt: binder.createdAt,
      expansionIds: binder.expansions.map((e) => e.tcgdexExpansionId),
      totalPages,
      page: { pageNumber, slots },
    };
  }

  async addPage(userId: string, binderId: string) {
    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
    });
    if (!binder) {
      throw new NotFoundException('Binder non trovato');
    }

    const lastPage = await this.prisma.binderPage.findFirst({
      where: { binderId },
      orderBy: { pageNumber: 'desc' },
    });
    const nextPageNumber = (lastPage?.pageNumber ?? 0) + 1;

    const page = await this.prisma.binderPage.create({
      data: { binderId, pageNumber: nextPageNumber },
    });

    const slotCount = binder.rows * binder.cols;
    await this.prisma.binderSlot.createMany({
      data: Array.from({ length: slotCount }, (_, position) => ({
        pageId: page.id,
        position,
      })),
    });

    return this.findOne(userId, binderId, nextPageNumber);
  }

  async updateSlot(
    userId: string,
    binderId: string,
    slotId: string,
    dto: UpdateSlotDto,
  ) {
    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
    });
    if (!binder) {
      throw new NotFoundException('Binder non trovato');
    }

    const slot = await this.prisma.binderSlot.findFirst({
      where: { id: slotId, page: { binderId } },
    });
    if (!slot) {
      throw new NotFoundException('Slot non trovato');
    }

    const data: {
      tcgdexCardId?: string | null;
      quantity?: number;
      condition?: string | null;
    } = {};

    if (dto.tcgdexCardId !== undefined) {
      data.tcgdexCardId = dto.tcgdexCardId;
      if (dto.tcgdexCardId === null) {
        // Svuotare lo slot azzera automaticamente quantità e condizione:
        // non ha senso "possedere 3 copie" di una busta vuota.
        data.quantity = 0;
        data.condition = null;
      }
    }
    if (dto.quantity !== undefined) {
      data.quantity = dto.quantity;
    }
    if (dto.condition !== undefined) {
      data.condition = dto.condition;
    }

    const updated = await this.prisma.binderSlot.update({
      where: { id: slotId },
      data,
    });

    return {
      id: updated.id,
      position: updated.position,
      tcgdexCardId: updated.tcgdexCardId,
      quantity: updated.quantity,
      condition: updated.condition,
      card: updated.tcgdexCardId
        ? await this.tcgdexService.getCardDetail(updated.tcgdexCardId)
        : null,
    };
  }

  async remove(userId: string, binderId: string) {
    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
    });
    if (!binder) {
      throw new NotFoundException('Binder non trovato');
    }

    // Le relazioni Binder -> BinderExpansion/BinderPage -> BinderSlot sono
    // onDelete: Cascade nello schema, quindi un solo delete pulisce tutto.
    await this.prisma.binder.delete({ where: { id: binderId } });

    return { success: true };
  }
}
