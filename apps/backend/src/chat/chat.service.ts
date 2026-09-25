import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TcgdexService } from '../catalog/tcgdex.service';
import type { FeaturedCardDto } from '../catalog/catalog.types';
import { BindersService } from '../binders/binders.service';
import { WishlistService } from '../wishlist/wishlist.service';
import { ChatApplyDto } from './dto/chat-apply.dto';
import { ChatMessageDto } from './dto/chat-message.dto';

type PendingAction = {
  op: 'add' | 'remove';
  targetType: 'binder' | 'wishlist';
  targetId: string;
  targetName: string;
};

type ChatReply = {
  reply: string;
  cards: FeaturedCardDto[];
  pending: PendingAction | null;
};

type CardRequest = {
  name: string;
  artist: string;
  expansion: string;
};

type ToolCall = {
  id: string;
  function: { name: string; arguments: string };
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_cards',
      description: 'Cerca fino a 3 carte. Compila sempre name, artist ed expansion: stringa vuota se il dato non è stato detto.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome carta in inglese TCGdex. Vuoto solo se l’utente non l’ha detto.' },
          artist: { type: 'string', description: 'Illustratore, solo se citato. Altrimenti stringa vuota.' },
          expansion: { type: 'string', description: 'Nome espansione in inglese, solo se citata. Altrimenti stringa vuota.' },
        },
        required: ['name', 'artist', 'expansion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_binder',
      description: 'Crea un binder per l’utente.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['FREE', 'GAME', 'EXPANSION', 'ARTIST'] },
          rows: { type: 'integer' },
          cols: { type: 'integer' },
          tcgGameCode: { type: 'string' },
          artistName: { type: 'string' },
          expansionIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_wishlist',
      description: 'Crea una wishlist.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_card',
      description: 'Prepara inserimento o rimozione di una carta da un binder o una wishlist. Non esegue da solo: propone le carte.',
      parameters: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'remove'] },
          targetType: { type: 'string', enum: ['binder', 'wishlist'] },
          targetName: { type: 'string' },
          name: { type: 'string', description: 'Nome carta in inglese TCGdex. Vuoto solo se l’utente non l’ha detto.' },
          artist: { type: 'string', description: 'Illustratore, solo se citato. Altrimenti stringa vuota.' },
          expansion: { type: 'string', description: 'Nome espansione in inglese, solo se citata. Altrimenti stringa vuota.' },
        },
        required: ['op', 'targetType', 'targetName', 'name', 'artist', 'expansion'],
      },
    },
  },
];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tcgdex: TcgdexService,
    private readonly binders: BindersService,
    private readonly wishlists: WishlistService,
  ) {}

  async handleMessage(userId: string, dto: ChatMessageDto): Promise<ChatReply> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Chat non configurata');
    }

    const context = await this.collectionContext(userId);
    const history = (dto.history ?? [])
      .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && turn.content)
      .slice(-8)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));

    const completion = await this.complete(apiKey, [
      {
        role: 'system',
        content: [
          'Sei l’assistente di Binder, un album digitale di carte Pokémon.',
          'Rispondi in italiano, breve.',
          'Per cercare, creare o modificare carte usa sempre un tool.',
          'Per ogni carta compila sempre name, artist ed expansion.',
          'name è il nome inglese TCGdex. artist è l’illustratore solo se l’utente lo dice. expansion è il set solo se l’utente lo dice.',
          'Se un dato non c’è, lascia la stringa vuota: non inventarlo.',
          'Se il tipo di binder non è chiaro, usa FREE con 3 righe e 3 colonne.',
          'Per un illustratore usa type ARTIST e artistName.',
          'Non inventare id di espansione: se servono espansioni e non hai gli id, chiedi di usare il form.',
          context,
        ].join('\n'),
      },
      ...history,
      { role: 'user', content: dto.message },
    ]);

    const tool = completion.toolCalls[0];
    if (!tool) {
      return { reply: completion.content || 'Non ho capito. Puoi riformulare?', cards: [], pending: null };
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tool.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      return { reply: 'Non sono riuscito a leggere la richiesta.', cards: [], pending: null };
    }

    if (tool.function.name === 'search_cards') {
      const cards = await this.matchCards(readCardRequest(args, dto.message));
      return {
        reply: cards.length
          ? 'Ho trovato queste corrispondenze. Aprilne una per il dettaglio.'
          : 'Nessuna carta corrisponde a questa descrizione.',
        cards,
        pending: null,
      };
    }

    if (tool.function.name === 'create_wishlist') {
      const name = String(args.name ?? '').trim();
      if (!name) return { reply: 'Mi serve un nome per la wishlist.', cards: [], pending: null };
      const created = await this.wishlists.createWishlist(userId, { name });
      return { reply: `Wishlist «${created.name}» creata.`, cards: [], pending: null };
    }

    if (tool.function.name === 'create_binder') {
      return this.createBinder(userId, args);
    }

    if (tool.function.name === 'change_card') {
      return this.prepareCardChange(userId, args);
    }

    return { reply: completion.content || 'Non so fare questa operazione.', cards: [], pending: null };
  }

  async apply(userId: string, dto: ChatApplyDto): Promise<{ reply: string }> {
    if (dto.targetType === 'wishlist') {
      if (dto.op === 'add') {
        const item = await this.wishlists.addItem(userId, dto.targetId, { tcgdexCardId: dto.cardId });
        return { reply: `${item.card?.name ?? 'Carta'} aggiunta alla wishlist.` };
      }
      const removed = await this.removeWishlistCard(userId, dto.targetId, dto.cardId);
      return { reply: removed ? 'Carta tolta dalla wishlist.' : 'Quella carta non è in wishlist.' };
    }

    if (dto.op === 'add') {
      const placed = await this.placeInBinder(userId, dto.targetId, dto.cardId);
      return { reply: placed };
    }
    const cleared = await this.clearFromBinder(userId, dto.targetId, dto.cardId);
    return { reply: cleared };
  }

  private async createBinder(userId: string, args: Record<string, unknown>): Promise<ChatReply> {
    const name = String(args.name ?? '').trim();
    const type = String(args.type ?? 'FREE');
    if (!name) return { reply: 'Mi serve un nome per il binder.', cards: [], pending: null };
    if (!['FREE', 'GAME', 'EXPANSION', 'ARTIST'].includes(type)) {
      return { reply: 'Tipo di binder non riconosciuto.', cards: [], pending: null };
    }
    if (type === 'EXPANSION' && !Array.isArray(args.expansionIds)) {
      return {
        reply: 'Per un binder di espansione scegli i set dal form di creazione: da qui non ho gli id.',
        cards: [],
        pending: null,
      };
    }

    const binder = await this.binders.create(userId, {
      name,
      type: type as 'FREE' | 'GAME' | 'EXPANSION' | 'ARTIST',
      rows: clampInt(args.rows, 3),
      cols: clampInt(args.cols, 3),
      ...(type === 'GAME' ? { tcgGameCode: String(args.tcgGameCode ?? 'pokemon') } : {}),
      ...(type === 'ARTIST' ? { artistName: String(args.artistName ?? '') } : {}),
      ...(type === 'EXPANSION' ? { expansionIds: args.expansionIds as string[] } : {}),
    });
    return { reply: `Binder «${binder.name}» creato.`, cards: [], pending: null };
  }

  private async prepareCardChange(userId: string, args: Record<string, unknown>): Promise<ChatReply> {
    const op = args.op === 'remove' ? 'remove' : 'add';
    const targetType = args.targetType === 'wishlist' ? 'wishlist' : 'binder';
    const targetName = String(args.targetName ?? '');
    const cards = await this.matchCards(readCardRequest(args));
    const target = await this.findTarget(userId, targetType, targetName);
    if (!target) {
      return {
        reply: `Non trovo ${targetType === 'binder' ? 'un binder' : 'una wishlist'} chiamato «${targetName}».`,
        cards,
        pending: null,
      };
    }
    if (cards.length === 0) {
      return { reply: 'Non ho trovato carte corrispondenti.', cards: [], pending: null };
    }
    const verb = op === 'add' ? 'aggiungere a' : 'togliere da';
    return {
      reply: `Puoi ${verb} «${target.name}». Scegli la carta, oppure aprila per il dettaglio.`,
      cards,
      pending: { op, targetType, targetId: target.id, targetName: target.name },
    };
  }

  private async matchCards(request: CardRequest): Promise<FeaturedCardDto[]> {
    const usable = [request.name, request.artist, request.expansion].some((value) => value.length >= 2);
    if (!usable) return [];

    let page = await this.tcgdex.searchCardsByFields(request, 3, 1);
    const narrowed = request.artist.length >= 2 || request.expansion.length >= 2;
    if (page.items.length === 0 && narrowed && request.name.length >= 2) {
      page = await this.tcgdex.searchCardsByFields({ name: request.name }, 3, 1);
    }

    const details = await Promise.all(page.items.map((item) => this.tcgdex.getCardDetail(item.id)));
    return details.filter((card): card is FeaturedCardDto => card !== null).slice(0, 3);
  }

  private async collectionContext(userId: string): Promise<string> {
    const [binders, wishlists] = await Promise.all([
      this.prisma.binder.findMany({ where: { userId }, select: { name: true }, take: 30 }),
      this.prisma.wishlist.findMany({ where: { userId }, select: { name: true }, take: 30 }),
    ]);
    const binderNames = binders.map((binder) => binder.name).join(', ') || 'nessuno';
    const wishlistNames = wishlists.map((wishlist) => wishlist.name).join(', ') || 'nessuna';
    return `Binder dell’utente: ${binderNames}. Wishlist: ${wishlistNames}.`;
  }

  private async findTarget(userId: string, targetType: 'binder' | 'wishlist', name: string) {
    const needle = name.trim().toLowerCase();
    if (targetType === 'binder') {
      const binders = await this.prisma.binder.findMany({ where: { userId }, select: { id: true, name: true } });
      return pickByName(binders, needle);
    }
    const wishlists = await this.prisma.wishlist.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    return pickByName(wishlists, needle);
  }

  private async placeInBinder(userId: string, binderId: string, cardId: string): Promise<string> {
    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
      include: { pages: { orderBy: { pageNumber: 'asc' }, include: { slots: true } } },
    });
    if (!binder) throw new BadRequestException('Binder non trovato');

    const slots = binder.pages.flatMap((page) => page.slots);
    const existing = slots.find((slot) => slot.tcgdexCardId === cardId);
    if (existing) {
      await this.binders.updateSlot(userId, binderId, existing.id, {
        quantity: Math.max(existing.quantity, 1),
      });
      return 'Carta segnata nel binder.';
    }
    const empty = slots.find((slot) => !slot.tcgdexCardId);
    if (!empty) {
      await this.binders.addPage(userId, binderId);
      return this.placeInBinder(userId, binderId, cardId);
    }
    await this.binders.updateSlot(userId, binderId, empty.id, {
      tcgdexCardId: cardId,
      quantity: 1,
    });
    return 'Carta inserita nel binder.';
  }

  private async clearFromBinder(userId: string, binderId: string, cardId: string): Promise<string> {
    const binder = await this.prisma.binder.findFirst({
      where: { id: binderId, userId },
      include: { pages: { include: { slots: true } } },
    });
    if (!binder) throw new BadRequestException('Binder non trovato');
    const slot = binder.pages.flatMap((page) => page.slots).find((item) => item.tcgdexCardId === cardId);
    if (!slot) return 'Quella carta non è in questo binder.';
    if (binder.type === 'EXPANSION' || binder.type === 'ARTIST') {
      await this.binders.updateSlot(userId, binderId, slot.id, { quantity: 0 });
      return 'Carta segnata come mancante nel checklist.';
    }
    await this.binders.updateSlot(userId, binderId, slot.id, { tcgdexCardId: null });
    return 'Carta tolta dal binder.';
  }

  private async removeWishlistCard(userId: string, wishlistId: string, cardId: string) {
    const wishlist = await this.prisma.wishlist.findFirst({ where: { id: wishlistId, userId } });
    if (!wishlist) throw new BadRequestException('Wishlist non trovata');
    const item = await this.prisma.wishlistItem.findFirst({
      where: { wishlistId, tcgdexCardId: cardId },
    });
    if (!item) return false;
    await this.wishlists.removeItem(userId, wishlistId, item.id);
    return true;
  }

  private async complete(apiKey: string, messages: { role: string; content: string }[]) {
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Groq ${response.status}: ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException('Il servizio di chat non risponde');
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    const message = data.choices?.[0]?.message;
    return {
      content: message?.content?.trim() ?? '',
      toolCalls: message?.tool_calls ?? [],
    };
  }
}

function readCardRequest(args: Record<string, unknown>, fallbackName = ''): CardRequest {
  const name = String(args.name ?? args.query ?? args.cardQuery ?? fallbackName).trim();
  return {
    name,
    artist: String(args.artist ?? '').trim(),
    expansion: String(args.expansion ?? '').trim(),
  };
}

function clampInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(1, Math.round(parsed)));
}

function pickByName<T extends { id: string; name: string }>(items: T[], needle: string) {
  if (!needle) return items.length === 1 ? items[0] : undefined;
  const exact = items.find((item) => item.name.toLowerCase() === needle);
  if (exact) return exact;
  return items.find(
    (item) =>
      item.name.toLowerCase().includes(needle) || needle.includes(item.name.toLowerCase()),
  );
}
