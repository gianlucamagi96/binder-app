import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import TCGdex, { Query } from '@tcgdex/sdk';
import { RedisService } from '../redis/redis.service';
import {
  CardSearchResultDto,
  ExpansionDetailDto,
  ExpansionDto,
  ExpansionSummaryDto,
  FeaturedCardDto,
  PaginatedCardSearchDto,
  PaginatedExpansionsDto,
} from './catalog.types';

const CACHE_TTL_SECONDS = 60 * 60 * 12; // 12 ore: espansioni/carte cambiano raramente
const SEARCH_CACHE_TTL_SECONDS = 60 * 60; // 1 ora: utile per query ripetute (Ctrl+K)
const EXPANSIONS_PAGE_DEFAULT = 24;
const SET_DETAIL_CONCURRENCY = 8;

// Le sets con serie.id === 'tcgp' appartengono a "Pokémon TCG Pocket" (gioco
// digitale, non cartaceo): un binder fisico non deve mostrarle tra le espansioni.
const EXCLUDED_SERIES = new Set(['tcgp']);

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Il campo `rarity` di TCGdex è testo libero, non un enum ordinato: non esiste
// un "tier" ufficiale nei dati. Questa lista è un'euristica curata a mano,
// dalla rarità più ambita (in alto) alla più comune, costruita a partire dai
// valori realmente osservati via `tcgdex.rarity.list()`. Serve solo per
// scegliere quali carte mostrare come "in evidenza": non è una fonte di verità.
const RARITY_PRIORITY: string[] = [
  'Crown',
  'Mega Hyper Rare',
  'Hyper rare',
  'Special illustration rare',
  'Shiny Ultra Rare',
  'Secret Rare',
  'Illustration rare',
  'ACE SPEC Rare',
  'Ultra Rare',
  'Rare Holo VMAX',
  'Rare Holo VSTAR',
  'Shiny rare VMAX',
  'Rare Holo V',
  'Shiny rare V',
  'Double rare',
  'Radiant Rare',
  'Amazing Rare',
  'Rare PRIME',
  'Rare Holo LV.X',
  'LEGEND',
  'Full Art Trainer',
  'Black White Rare',
  'Pikachu Rare',
  'Three Star',
  'Two Star',
  'One Star',
  'Two Shiny',
  'One Shiny',
  'Shiny rare',
  'Holo Rare VMAX',
  'Holo Rare VSTAR',
  'Holo Rare V',
  'Holo Rare',
  'Rare Holo',
  'Four Diamond',
  'Rare',
];

@Injectable()
export class TcgdexService {
  private readonly logger = new Logger(TcgdexService.name);
  private readonly client = new TCGdex('en');

  constructor(private readonly redis: RedisService) {}

  async getRecentExpansions(limit: number): Promise<ExpansionDto[]> {
    const cacheKey = `catalog:expansions:recent:${limit}`;
    const cached = await this.redis.getJSON<ExpansionDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Il resume restituito da set.list() non porta il campo `serie` (solo
    // il Set completo ce l'ha), quindi il filtro "no TCG Pocket" può essere
    // applicato solo dopo aver scaricato il dettaglio di ogni set. Peschiamo
    // più set del necessario e ci fermiamo non appena ne troviamo `limit`
    // validi, invece di scaricare il dettaglio di tutti gli over-fetched.
    const overFetchCount = Math.min(Math.max(limit * 6, 30), 100);
    const query = new Query()
      .sort('releaseDate', 'DESC')
      .paginate(1, overFetchCount);
    const resumes = await this.client.set.list(query);

    const expansions: ExpansionDto[] = [];
    for (const resume of resumes) {
      if (expansions.length >= limit) {
        break;
      }
      const set = await this.client.set.get(resume.id);
      if (!set || EXCLUDED_SERIES.has(set.serie.id)) {
        continue;
      }
      expansions.push(this.toExpansionDto(set));
    }

    await this.redis.setJSON(cacheKey, expansions, CACHE_TTL_SECONDS);
    return expansions;
  }

  // Lista paginata di tutte le espansioni cartacee. TCGdex espone solo
  // paginazione per page/itemsPerPage e i resume non includono serie né
  // releaseDate: costruiamo (e cachiamo a lungo) l'elenco completo filtrato,
  // poi paginiamo in-process con un cursor opaco = offset.
  async listExpansions(
    limit = EXPANSIONS_PAGE_DEFAULT,
    cursor?: string,
    q?: string,
  ): Promise<PaginatedExpansionsDto> {
    const all = await this.getAllExpansionsCached();
    const needle = q?.trim().toLowerCase();
    const filtered = needle
      ? all.filter(
          (expansion) =>
            expansion.name.toLowerCase().includes(needle) ||
            expansion.serie.name.toLowerCase().includes(needle),
        )
      : all;

    const offset = this.decodeCursor(cursor);
    const items = filtered.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    const nextCursor =
      nextOffset < filtered.length ? this.encodeCursor(nextOffset) : null;

    return { items, nextCursor, total: filtered.length };
  }

  async getExpansionDetail(setId: string): Promise<ExpansionDetailDto> {
    const cacheKey = `catalog:expansion:detail:${setId}`;
    const cached = await this.redis.getJSON<ExpansionDetailDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const set = await this.client.set.get(setId);
    if (!set || EXCLUDED_SERIES.has(set.serie.id)) {
      throw new NotFoundException('Espansione non trovata');
    }

    // Una sola chiamata set.get: le carte arrivano come resume (id/name/image).
    // Costruiamo FeaturedCardDto senza N card.get — rarity/hp/types restano
    // vuoti sul dettaglio catalogo; il Card UI li mostra solo se presenti.
    const dto: ExpansionDetailDto = {
      ...this.toExpansionDto(set),
      cards: set.cards.map((card) => ({
        id: card.id,
        name: card.name,
        image: card.image ? card.getImageURL('high', 'webp') : null,
        rarity: '',
        hp: null,
        types: [],
        set: { id: set.id, name: set.name },
      })),
    };

    await this.redis.setJSON(cacheKey, dto, CACHE_TTL_SECONDS);
    return dto;
  }

  async searchIllustrators(query: string, limit: number): Promise<string[]> {
    const names = await this.getIllustratorsCached();
    const needle = query.trim().toLowerCase();
    return names.filter((name) => name.toLowerCase().includes(needle)).slice(0, limit);
  }

  async getIllustratorCards(name: string): Promise<string[] | null> {
    const cacheKey = `catalog:illustrator:${name.toLowerCase()}`;
    const cached = await this.redis.getJSON<string[] | null>(cacheKey);
    if (cached) {
      return cached;
    }

    const illustrator = await this.client.illustrator.get(name);
    if (!illustrator) {
      return null;
    }

    const cardIds = illustrator.cards.map((card) => card.id);
    await this.redis.setJSON(cacheKey, cardIds, CACHE_TTL_SECONDS);
    return cardIds;
  }

  private async getIllustratorsCached(): Promise<string[]> {
    const cacheKey = 'catalog:illustrators';
    const cached = await this.redis.getJSON<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const names = ((await this.client.illustrator.list()) ?? [])
      .map((name) => String(name))
      .sort((a, b) => a.localeCompare(b, 'en'));
    await this.redis.setJSON(cacheKey, names, CACHE_TTL_SECONDS);
    return names;
  }

  // Dettaglio di una singola carta, cacheato per id: usato sia per arricchire
  // gli slot dei binder sia (potenzialmente) altrove. Una sola chiamata
  // TCGdex per carta, poi sempre dalla cache per 12 ore.
  async getCardDetail(cardId: string): Promise<FeaturedCardDto | null> {
    const cacheKey = `catalog:card:${cardId}`;
    const cached = await this.redis.getJSON<FeaturedCardDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const card = await this.client.card.get(cardId);
    if (!card) {
      return null;
    }

    const dto: FeaturedCardDto = {
      id: card.id,
      name: card.name,
      image: card.image ? card.getImageURL('high', 'webp') : null,
      rarity: card.rarity,
      hp: card.hp ?? null,
      types: card.types ?? [],
      set: { id: card.set.id, name: card.set.name },
    };

    await this.redis.setJSON(cacheKey, dto, CACHE_TTL_SECONDS);
    return dto;
  }

  // Riepilogo di un'espansione con l'elenco carte (id/localId/name), usato
  // per generare il checklist di un binder EXPANSION: una sola chiamata
  // TCGdex per l'intera espansione (set.get già include tutte le carte),
  // altrimenti bisognerebbe interrogare TCGdex una volta per carta.
  async getExpansionSummary(setId: string): Promise<ExpansionSummaryDto | null> {
    const cacheKey = `catalog:set:${setId}`;
    const cached = await this.redis.getJSON<ExpansionSummaryDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const set = await this.client.set.get(setId);
    if (!set) {
      return null;
    }

    const dto: ExpansionSummaryDto = {
      id: set.id,
      name: set.name,
      logo: set.logo ? `${set.logo}.png` : null,
      cards: set.cards.map((card) => ({
        id: card.id,
        localId: card.localId,
        name: card.name,
      })),
    };

    await this.redis.setJSON(cacheKey, dto, CACHE_TTL_SECONDS);
    return dto;
  }

  // Ricerca per nome via TCGdex `like` (contains, case-insensitive).
  // Cache 1h sulla query normalizzata + pagina; i resume non portano il set,
  // quindi arricchiamo con getCardDetail (a sua volta cachato 12h).
  async searchCards(
    query: string,
    limit: number,
    page = 1,
  ): Promise<PaginatedCardSearchDto> {
    const normalized = normalizeSearchText(query);
    return this.runCardSearch(
      `catalog:cards:search:${normalized}:${page}:${limit}`,
      new Query().like('name', normalized).paginate(page, limit),
      page,
      limit,
    );
  }

  // Ricerca chat: nome, illustratore e nome espansione, solo i campi compilati.
  async searchCardsByFields(
    fields: { name?: string; artist?: string; expansion?: string },
    limit: number,
    page = 1,
  ): Promise<PaginatedCardSearchDto> {
    const name = normalizeSearchText(fields.name ?? '');
    const artist = normalizeSearchText(fields.artist ?? '');
    const expansion = normalizeSearchText(fields.expansion ?? '');
    if (!name && !artist && !expansion) {
      return { items: [], page, hasMore: false };
    }

    let searchQuery = new Query();
    if (name) searchQuery = searchQuery.like('name', name);
    if (artist) searchQuery = searchQuery.like('illustrator', artist);
    if (expansion) searchQuery = searchQuery.like('set.name', expansion);

    return this.runCardSearch(
      `catalog:cards:search:fields:${name}|${artist}|${expansion}:${page}:${limit}`,
      searchQuery.paginate(page, limit),
      page,
      limit,
    );
  }

  private async runCardSearch(
    cacheKey: string,
    searchQuery: Query,
    page: number,
    limit: number,
  ): Promise<PaginatedCardSearchDto> {
    const cached = await this.redis.getJSON<PaginatedCardSearchDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const results = await this.client.card.list(searchQuery);

    const items = await Promise.all(
      results.map(async (card) => {
        const detail = await this.getCardDetail(card.id);
        return {
          id: card.id,
          name: card.name,
          image: card.image
            ? card.getImageURL('low', 'webp')
            : (detail?.image ?? null),
          set: detail?.set ?? null,
        } satisfies CardSearchResultDto;
      }),
    );

    const dto: PaginatedCardSearchDto = {
      items,
      page,
      // TCGdex non espone un totale: se la pagina è piena, probabilmente ce n'è un'altra.
      hasMore: items.length >= limit,
    };

    await this.redis.setJSON(cacheKey, dto, SEARCH_CACHE_TTL_SECONDS);
    return dto;
  }

  async getFeaturedCards(limit: number): Promise<FeaturedCardDto[]> {
    const cacheKey = `catalog:cards:featured:${limit}`;
    const cached = await this.redis.getJSON<FeaturedCardDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const latestSetId = await this.findMostRecentMainlineSetId();
    if (!latestSetId) {
      return [];
    }

    const selectedIds = await this.selectFeaturedCardIds(latestSetId, limit);

    const cards = await Promise.all(
      selectedIds.map((id) => this.client.card.get(id)),
    );

    const featured: FeaturedCardDto[] = cards
      .filter((card): card is NonNullable<typeof card> => card !== null)
      .map((card) => ({
        id: card.id,
        name: card.name,
        image: card.image ? card.getImageURL('high', 'webp') : null,
        rarity: card.rarity,
        hp: card.hp ?? null,
        types: card.types ?? [],
        set: { id: card.set.id, name: card.set.name },
      }));

    await this.redis.setJSON(cacheKey, featured, CACHE_TTL_SECONDS);
    return featured;
  }

  private async getAllExpansionsCached(): Promise<ExpansionDto[]> {
    const cacheKey = 'catalog:expansions:all';
    const cached = await this.redis.getJSON<ExpansionDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Senza paginate TCGdex restituisce l'intero elenco di set (centinaia).
    // I resume non hanno serie/releaseDate: arricchiamo a batch per filtrare
    // Pocket e ordinare per data.
    const resumes = await this.client.set.list(
      new Query().sort('releaseDate', 'DESC'),
    );

    const expansions: ExpansionDto[] = [];
    for (let i = 0; i < resumes.length; i += SET_DETAIL_CONCURRENCY) {
      const batch = resumes.slice(i, i + SET_DETAIL_CONCURRENCY);
      const details = await Promise.all(
        batch.map((resume) =>
          this.client.set.get(resume.id).catch((error) => {
            this.logger.warn(`Dettaglio set ${resume.id} fallito: ${error}`);
            return null;
          }),
        ),
      );
      for (const set of details) {
        if (!set || EXCLUDED_SERIES.has(set.serie.id)) {
          continue;
        }
        expansions.push(this.toExpansionDto(set));
      }
    }

    expansions.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    await this.redis.setJSON(cacheKey, expansions, CACHE_TTL_SECONDS);
    return expansions;
  }

  private toExpansionDto(set: {
    id: string;
    name: string;
    logo?: string;
    releaseDate: string;
    cardCount: { total: number; official: number };
    serie: { id: string; name: string };
  }): ExpansionDto {
    return {
      id: set.id,
      name: set.name,
      logo: set.logo ? `${set.logo}.png` : null,
      releaseDate: set.releaseDate,
      cardCount: {
        total: set.cardCount.total,
        official: set.cardCount.official,
      },
      serie: { id: set.serie.id, name: set.serie.name },
    };
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(String(offset), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) {
      return 0;
    }
    try {
      const raw = Buffer.from(cursor, 'base64url').toString('utf8');
      const offset = Number.parseInt(raw, 10);
      return Number.isFinite(offset) && offset >= 0 ? offset : 0;
    } catch {
      return 0;
    }
  }

  private async findMostRecentMainlineSetId(): Promise<string | null> {
    const query = new Query().sort('releaseDate', 'DESC').paginate(1, 30);
    const resumes = await this.client.set.list(query);

    for (const resume of resumes) {
      if (resume.cardCount.total === 0) {
        continue;
      }
      const set = await this.client.set.get(resume.id);
      if (set && !EXCLUDED_SERIES.has(set.serie.id)) {
        return set.id;
      }
    }

    return null;
  }

  private async selectFeaturedCardIds(
    setId: string,
    limit: number,
  ): Promise<string[]> {
    const selected: string[] = [];
    const seen = new Set<string>();

    for (const rarity of RARITY_PRIORITY) {
      if (selected.length >= limit) {
        break;
      }
      const query = new Query().equal('set.id', setId).equal('rarity', rarity);
      const matches = await this.client.card.list(query).catch((error) => {
        this.logger.warn(
          `Query rarità "${rarity}" fallita per il set ${setId}: ${error}`,
        );
        return [];
      });
      for (const match of matches) {
        if (!seen.has(match.id)) {
          seen.add(match.id);
          selected.push(match.id);
        }
      }
    }

    if (selected.length < limit) {
      // Fallback: il set non espone abbastanza carte nelle rarità "alte"
      // note, quindi completiamo con le prime carte del set nell'ordine
      // ufficiale, a prescindere dalla rarità.
      const set = await this.client.set.get(setId);
      if (set) {
        for (const card of set.cards) {
          if (selected.length >= limit) {
            break;
          }
          if (!seen.has(card.id)) {
            seen.add(card.id);
            selected.push(card.id);
          }
        }
      }
    }

    return selected.slice(0, limit);
  }
}
