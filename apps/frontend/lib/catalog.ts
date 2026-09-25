import { API_URL } from "@/lib/auth";

export type Expansion = {
  id: string;
  name: string;
  logo: string | null;
  releaseDate: string;
  cardCount: {
    total: number;
    official: number;
  };
  serie: {
    id: string;
    name: string;
  };
};

export type FeaturedCard = {
  id: string;
  name: string;
  image: string | null;
  rarity: string;
  hp: number | null;
  types: string[];
  set: {
    id: string;
    name: string;
  };
};

export type CardSearchResult = {
  id: string;
  name: string;
  image: string | null;
  set: { id: string; name: string } | null;
};

export type PaginatedCardSearch = {
  items: CardSearchResult[];
  page: number;
  hasMore: boolean;
};

export type PaginatedExpansions = {
  items: Expansion[];
  nextCursor: string | null;
  total: number;
};

export type ExpansionDetail = Expansion & {
  cards: FeaturedCard[];
};

export async function fetchExpansions(params: {
  limit?: number;
  cursor?: string | null;
  q?: string;
}): Promise<PaginatedExpansions> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.q?.trim()) search.set("q", params.q.trim());

  const res = await fetch(`${API_URL}/catalog/expansions?${search}`);
  if (!res.ok) {
    throw new Error("Impossibile caricare le espansioni");
  }
  return res.json();
}

export async function fetchExpansionDetail(id: string): Promise<ExpansionDetail> {
  const res = await fetch(`${API_URL}/catalog/expansions/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error("Espansione non trovata");
  }
  return res.json();
}

export async function searchCatalogCards(
  q: string,
  options?: { limit?: number; page?: number },
): Promise<PaginatedCardSearch> {
  const search = new URLSearchParams({
    q,
    limit: String(options?.limit ?? 24),
    page: String(options?.page ?? 1),
  });
  const res = await fetch(`${API_URL}/catalog/cards/search?${search}`);
  if (!res.ok) {
    throw new Error("Ricerca fallita");
  }
  return res.json();
}

export function searchResultToFeaturedCard(result: CardSearchResult): FeaturedCard {
  return {
    id: result.id,
    name: result.name,
    image: result.image,
    rarity: "",
    hp: null,
    types: [],
    set: result.set ?? { id: "", name: "—" },
  };
}
