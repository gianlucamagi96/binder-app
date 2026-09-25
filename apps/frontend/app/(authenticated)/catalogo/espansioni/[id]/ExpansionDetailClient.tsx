"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ExpansionDetail, FeaturedCard } from "@/lib/catalog";
import { fetchExpansionDetail } from "@/lib/catalog";
import { Card, CardSkeleton } from "@/components/Card";
import { CardDetailModal } from "@/components/CardDetailModal";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

export default function ExpansionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const highlightCardId = searchParams.get("card");
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; expansion: ExpansionDetail }
  >({ status: "loading" });
  const [selectedCard, setSelectedCard] = useState<FeaturedCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchExpansionDetail(params.id)
      .then((expansion) => {
        if (!cancelled) setState({ status: "ready", expansion });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (state.status !== "ready" || !highlightCardId) return;
    const frame = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [state, highlightCardId]);

  return (
    <PageContainer className="gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/catalogo"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Catalogo
        </Link>

        {state.status === "loading" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Skeleton className="h-20 w-40" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        )}

        {state.status === "ready" && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-xs">
              {state.expansion.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.expansion.logo}
                  alt={state.expansion.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-foreground-muted">{state.expansion.name}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {state.expansion.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{state.expansion.serie.name}</Badge>
                <Badge mono>{formatDate(state.expansion.releaseDate)}</Badge>
                <Badge mono>{state.expansion.cardCount.total} carte</Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      {state.status === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <EmptyState
          tone="error"
          title="Espansione non trovata"
          action={
            <Button href="/catalogo" variant="secondary">
              Torna al catalogo
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.expansion.cards.length === 0 && (
        <EmptyState title="Nessuna carta in questa espansione" />
      )}

      {state.status === "ready" && state.expansion.cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {state.expansion.cards.map((card) => {
            const highlighted = highlightCardId === card.id;
            return (
              <div
                key={card.id}
                id={`card-${card.id}`}
                ref={highlighted ? highlightRef : undefined}
                className={
                  highlighted
                    ? "rounded-[var(--radius-lg)] ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : undefined
                }
              >
                <Card card={card} onClick={() => setSelectedCard(card)} />
              </div>
            );
          })}
        </div>
      )}

      {selectedCard && (
        <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </PageContainer>
  );
}
