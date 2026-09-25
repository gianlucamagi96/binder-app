"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, type TcgGame } from "@/lib/auth";
import { useAuth } from "@/context/auth-context";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { TcgGameIcon } from "@/components/TcgGameIcon";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; games: TcgGame[] };

export default function TcgPickerPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  const loadGames = useCallback(() => {
    setState({ status: "loading" });
    fetch(`${API_URL}/tcg-games`)
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((games: TcgGame[]) => setState({ status: "ready", games }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  async function handleSelect(game: TcgGame) {
    if (game.status !== "ACTIVE" || selecting) {
      return;
    }

    setSelecting(game.code);
    setSelectError(null);
    try {
      const res = await fetch("/api/user/active-tcg", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: game.code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Impossibile selezionare questo gioco");
      }
      await refreshUser();
      router.push("/dashboard");
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : "Impossibile selezionare questo gioco");
      setSelecting(null);
    }
  }

  return (
    <PageContainer className="items-center justify-center gap-8 py-10 sm:py-16">
      <PageHeader
        eyebrow="Gioco attivo"
        title="Scegli il tuo gioco"
        description="Potrai cambiarlo in qualsiasi momento dall’header."
      />

      <div className="flex w-full flex-col items-center gap-6">
        {state.status === "loading" && (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-[var(--radius-xl)]" />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <EmptyState
            tone="error"
            title="Impossibile caricare la lista dei giochi"
            action={
              <Button variant="secondary" onClick={loadGames}>
                Riprova
              </Button>
            }
          />
        )}

        {selectError && (
          <p className="w-full rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-center text-sm text-danger-foreground">
            {selectError}
          </p>
        )}

        {state.status === "ready" && (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {state.games.map((game) => {
              const isActive = game.status === "ACTIVE";
              const isSelecting = selecting === game.code;
              const isCurrent = user?.activeTcgGameCode === game.code;

              return (
                <button
                  key={game.code}
                  type="button"
                  disabled={!isActive || selecting !== null}
                  onClick={() => handleSelect(game)}
                  className={`relative flex min-h-[11rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border bg-surface p-8 text-center shadow-card transition-[border-color,box-shadow,transform,background-color] duration-150 ${
                    isCurrent
                      ? "border-accent ring-2 ring-accent/15"
                      : "border-border"
                  } ${
                    isActive
                      ? "cursor-pointer hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md active:scale-[0.99]"
                      : "cursor-not-allowed opacity-50"
                  }`}
                >
                  {!isActive && (
                    <span className="absolute right-3 top-3">
                      <Badge tone="neutral">Presto disponibile</Badge>
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute left-3 top-3">
                      <Badge tone="accent">Attivo</Badge>
                    </span>
                  )}
                  <TcgGameIcon
                    icon={game.icon}
                    name={game.name}
                    className="h-16 w-11 drop-shadow-md"
                    emojiClassName="text-5xl leading-none"
                  />
                  <span className="font-display text-lg font-semibold text-foreground">
                    {game.name}
                  </span>
                  {isSelecting && (
                    <span className="text-sm text-foreground-muted">Selezione in corso...</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
