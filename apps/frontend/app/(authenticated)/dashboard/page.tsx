"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Layers } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { API_URL } from "@/lib/auth";
import type { Expansion, FeaturedCard } from "@/lib/catalog";
import { ExpansionTile } from "@/components/ExpansionTile";
import { Card } from "@/components/Card";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

type SectionState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T[] };

function useCatalogSection<T>(path: string) {
  const [state, setState] = useState<SectionState<T>>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`${API_URL}${path}`)
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: T[]) => setState({ status: "ready", data }))
      .catch(() => setState({ status: "error" }));
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return [state, load] as const;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [expansions, reloadExpansions] = useCatalogSection<Expansion>(
    "/catalog/expansions/recent?limit=10",
  );
  const [featuredCards, reloadFeaturedCards] = useCatalogSection<FeaturedCard>(
    "/catalog/cards/featured?limit=12",
  );

  if (loading) {
    return (
      <PageContainer className="gap-8">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-32 w-full rounded-[var(--radius-xl)]" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-44 shrink-0" />
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="gap-10">
      <PageHeader
        eyebrow="Collezione"
        title={`Ciao${user ? `, ${user.username}` : ""}`}
        description="Esplora le ultime espansioni e le carte in evidenza, poi apri i tuoi binder."
        action={
          <Button href="/binders" variant="ember">
            <BookOpen className="h-4 w-4" aria-hidden />
            I miei binder
          </Button>
        }
      />

      <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-ember/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Azione rapida
            </p>
            <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
              Continua la tua collezione
            </h2>
            <p className="max-w-md text-sm text-foreground-muted">
              Apri un binder esistente o creane uno nuovo per un&apos;espansione.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/binders" variant="primary">
              Apri binder
            </Button>
            <Button href="/binders/new" variant="secondary">
              Nuovo binder
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent-text" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Ultime espansioni</h2>
        </div>

        {expansions.status === "loading" && (
          <div className="scroll-fade-x flex gap-4 overflow-x-auto pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-44 shrink-0 sm:w-52" />
            ))}
          </div>
        )}

        {expansions.status === "error" && (
          <EmptyState
            tone="error"
            title="Impossibile caricare le espansioni"
            action={
              <Button variant="secondary" onClick={reloadExpansions}>
                Riprova
              </Button>
            }
          />
        )}

        {expansions.status === "ready" && expansions.data.length === 0 && (
          <EmptyState title="Nessuna espansione disponibile al momento" />
        )}

        {expansions.status === "ready" && expansions.data.length > 0 && (
          <div className="scroll-fade-x -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-0 sm:gap-4 sm:px-0">
            {expansions.data.map((expansion) => (
              <ExpansionTile key={expansion.id} expansion={expansion} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Carte in evidenza</h2>

        {featuredCards.status === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[5/7] w-full" />
            ))}
          </div>
        )}

        {featuredCards.status === "error" && (
          <EmptyState
            tone="error"
            title="Impossibile caricare le carte"
            action={
              <Button variant="secondary" onClick={reloadFeaturedCards}>
                Riprova
              </Button>
            }
          />
        )}

        {featuredCards.status === "ready" && featuredCards.data.length === 0 && (
          <EmptyState title="Nessuna carta in evidenza al momento" />
        )}

        {featuredCards.status === "ready" && featuredCards.data.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {featuredCards.data.map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
