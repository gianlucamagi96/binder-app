export type ExpansionDto = {
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

export type FeaturedCardDto = {
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

export type CardSearchResultDto = {
  id: string;
  name: string;
  image: string | null;
  set: {
    id: string;
    name: string;
  } | null;
};

export type PaginatedCardSearchDto = {
  items: CardSearchResultDto[];
  page: number;
  hasMore: boolean;
};

export type ExpansionSummaryDto = {
  id: string;
  name: string;
  logo: string | null;
  cards: { id: string; localId: string; name: string }[];
};

export type ExpansionDetailDto = {
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
  cards: FeaturedCardDto[];
};

export type PaginatedExpansionsDto = {
  items: ExpansionDto[];
  nextCursor: string | null;
  total: number;
};
