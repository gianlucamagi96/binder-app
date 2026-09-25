"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers, Search } from "lucide-react";
import type { CardSearchResult, Expansion, FeaturedCard } from "@/lib/catalog";
import {
  fetchExpansions,
  searchCatalogCards,
  searchResultToFeaturedCard,
} from "@/lib/catalog";
import { API_URL } from "@/lib/auth";
import { Card, CardSkeleton } from "@/components/Card";
import { CardDetailModal } from "@/components/CardDetailModal";
import { ExpansionTile, ExpansionTileSkeleton } from "@/components/ExpansionTile";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";

const CARD_PAGE_SIZE = 24;

type CardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      results: CardSearchResult[];
      page: number;
      hasMore: boolean;
    };

type FeaturedState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; cards: FeaturedCard[] };

export default function CatalogoPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<FeaturedCard | null>(null);

  const [cardState, setCardState] = useState<CardState>({ status: "idle" });
  const [featuredState, setFeaturedState] = useState<FeaturedState>({ status: "loading" });

  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalExpansions, setTotalExpansions] = useState(0);
  const [expansionsStatus, setExpansionsStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMoreCards, setLoadingMoreCards] = useState(false);

  const isSearching = debouncedQuery.length > 0;
  const canSearchCards = debouncedQuery.length >= 2;

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const loadExpansions = useCallback(
    async (cursor: string | null, q: string, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setExpansionsStatus("loading");
      }
      try {
        const page = await fetchExpansions({
          limit: 24,
          cursor,
          q: q.length >= 1 ? q : undefined,
        });
        setExpansions((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setTotalExpansions(page.total);
        setExpansionsStatus("ready");
      } catch {
        if (!append) {
          setExpansions([]);
          setNextCursor(null);
          setExpansionsStatus("error");
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadExpansions(null, debouncedQuery, false);
  }, [debouncedQuery, loadExpansions]);

  useEffect(() => {
    if (isSearching) return;
    let cancelled = false;
    setFeaturedState({ status: "loading" });
    fetch(`${API_URL}/catalog/cards/featured?limit=12`)
      .then((res) => {
        if (!res.ok) throw new Error("featured failed");
        return res.json();
      })
      .then((cards: FeaturedCard[]) => {
        if (!cancelled) setFeaturedState({ status: "ready", cards });
      })
      .catch(() => {
        if (!cancelled) setFeaturedState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [isSearching]);

  useEffect(() => {
    if (!canSearchCards) {
      setCardState({ status: "idle" });
      setLoadingMoreCards(false);
      return;
    }
    let cancelled = false;
    setCardState({ status: "loading" });
    setLoadingMoreCards(false);
    searchCatalogCards(debouncedQuery, { limit: CARD_PAGE_SIZE, page: 1 })
      .then((page) => {
        if (!cancelled) {
          setCardState({
            status: "ready",
            results: page.items,
            page: page.page,
            hasMore: page.hasMore,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCardState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [canSearchCards, debouncedQuery]);

  async function loadMoreCards() {
    if (cardState.status !== "ready" || !cardState.hasMore || loadingMoreCards) {
      return;
    }
    setLoadingMoreCards(true);
    try {
      const nextPage = cardState.page + 1;
      const page = await searchCatalogCards(debouncedQuery, {
        limit: CARD_PAGE_SIZE,
        page: nextPage,
      });
      setCardState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          status: "ready",
          results: [...prev.results, ...page.items],
          page: page.page,
          hasMore: page.hasMore,
        };
      });
    } catch {
      // Keep existing results; user can retry via the button.
    } finally {
      setLoadingMoreCards(false);
    }
  }

  return (
    <PageContainer className="gap-8">
      <PageHeader
        eyebrow="TCGdex"
        title="Catalogo"
        description="Cerca carte o espansioni per nome: i risultati si aggiornano mentre digiti."
      />

      <Input
        label="Cerca nel catalogo"
        placeholder="Es. Charizard, Obsidian Flames…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        hint={
          query.trim().length === 1
            ? "Un altro carattere per cercare anche le carte"
            : undefined
        }
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-foreground-muted" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {canSearchCards ? "Carte" : "Carte in evidenza"}
          </h2>
        </div>

        {!isSearching && featuredState.status === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isSearching && featuredState.status === "ready" && featuredState.cards.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {featuredState.cards.map((card) => (
              <Card key={card.id} card={card} onClick={() => setSelectedCard(card)} />
            ))}
          </div>
        )}

        {!isSearching && featuredState.status === "error" && (
          <p className="text-sm text-foreground-muted">
            Carte in evidenza non disponibili al momento.
          </p>
        )}

        {isSearching && !canSearchCards && (
          <EmptyState
            icon={<Search className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
            title="Continua a digitare"
            description="Servono almeno 2 caratteri per la ricerca carte su TCGdex."
          />
        )}

        {canSearchCards && cardState.status === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {canSearchCards && cardState.status === "error" && (
          <EmptyState
            tone="error"
            title="Ricerca carte non riuscita"
            description="Riprova tra poco: il catalogo TCGdex potrebbe essere temporaneamente non disponibile."
          />
        )}

        {canSearchCards && cardState.status === "ready" && cardState.results.length === 0 && (
          <EmptyState
            title="Nessuna carta trovata"
            description={`Nessun risultato per «${debouncedQuery}».`}
          />
        )}

        {canSearchCards && cardState.status === "ready" && cardState.results.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {cardState.results.map((result) => {
                const card = searchResultToFeaturedCard(result);
                return (
                  <Card key={result.id} card={card} onClick={() => setSelectedCard(card)} />
                );
              })}
            </div>
            {cardState.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => void loadMoreCards()}
                  disabled={loadingMoreCards}
                >
                  {loadingMoreCards ? "Caricamento..." : "Mostra altre"}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-foreground-muted" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Espansioni</h2>
          {expansionsStatus === "ready" && (
            <span className="text-xs text-foreground-muted">
              {totalExpansions}
              {debouncedQuery ? ` per «${debouncedQuery}»` : ""}
            </span>
          )}
        </div>

        {expansionsStatus === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <ExpansionTileSkeleton key={i} />
            ))}
          </div>
        )}

        {expansionsStatus === "error" && (
          <EmptyState
            tone="error"
            title="Impossibile caricare le espansioni"
            action={
              <Button
                variant="secondary"
                onClick={() => void loadExpansions(null, debouncedQuery, false)}
              >
                Riprova
              </Button>
            }
          />
        )}

        {expansionsStatus === "ready" && expansions.length === 0 && (
          <EmptyState
            title="Nessuna espansione trovata"
            description={
              debouncedQuery
                ? `Nessun set corrisponde a «${debouncedQuery}».`
                : "Il catalogo sembra vuoto al momento."
            }
          />
        )}

        {expansionsStatus === "ready" && expansions.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
              {expansions.map((expansion) => (
                <ExpansionTile
                  key={expansion.id}
                  expansion={expansion}
                  href={`/catalogo/espansioni/${expansion.id}`}
                />
              ))}
            </div>
            {nextCursor && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => void loadExpansions(nextCursor, debouncedQuery, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Caricamento..." : "Carica altre"}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {selectedCard && (
        <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </PageContainer>
  );
}
