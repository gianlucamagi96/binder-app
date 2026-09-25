"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import type { WishlistDetail } from "@/lib/wishlist";
import {
  deleteWishlist,
  fetchWishlist,
  removeFromWishlist,
  renameWishlist,
} from "@/lib/wishlist";
import { Card, CardSkeleton } from "@/components/Card";
import { CardDetailModal } from "@/components/CardDetailModal";
import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FeaturedCard } from "@/lib/catalog";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; wishlist: WishlistDetail };

export default function WishlistDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedCard, setSelectedCard] = useState<FeaturedCard | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchWishlist(params.id)
      .then((wishlist) => {
        setState({ status: "ready", wishlist });
        setNameDraft(wishlist.name);
      })
      .catch(() => setState({ status: "error" }));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(itemId: string) {
    setRemovingId(itemId);
    try {
      await removeFromWishlist(params.id, itemId);
      setState((prev) =>
        prev.status === "ready"
          ? {
              status: "ready",
              wishlist: {
                ...prev.wishlist,
                items: prev.wishlist.items.filter((item) => item.id !== itemId),
              },
            }
          : prev,
      );
    } catch {
      // keep list
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed || state.status !== "ready") return;
    setBusy(true);
    try {
      await renameWishlist(params.id, trimmed);
      setState({
        status: "ready",
        wishlist: { ...state.wishlist, name: trimmed },
      });
      setRenaming(false);
    } catch {
      // keep editing
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Eliminare definitivamente questa wishlist e tutte le sue carte?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteWishlist(params.id);
      router.push("/wishlist");
    } catch {
      setBusy(false);
    }
  }

  return (
    <PageContainer className="gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href="/wishlist"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Tutte le wishlist
          </Link>

          {state.status === "loading" && <Skeleton className="h-8 w-48" />}

          {state.status === "ready" && !renaming && (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {state.wishlist.name}
              </h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRenaming(true)}
                aria-label="Rinomina"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          )}

          {state.status === "ready" && renaming && (
            <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Input
                  label="Nome"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  autoFocus
                />
              </div>
              <Button variant="ember" size="sm" onClick={handleRename} disabled={busy}>
                Salva
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenaming(false);
                  setNameDraft(state.wishlist.name);
                }}
              >
                Annulla
              </Button>
            </div>
          )}

          {state.status === "ready" && (
            <p className="text-sm text-foreground-muted">
              {state.wishlist.items.length} cart
              {state.wishlist.items.length === 1 ? "a" : "e"}
            </p>
          )}
        </div>

        {state.status === "ready" && (
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Elimina wishlist
          </Button>
        )}
      </div>

      {state.status === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <EmptyState
          tone="error"
          title="Wishlist non trovata"
          action={
            <Button href="/wishlist" variant="secondary">
              Torna alle wishlist
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.wishlist.items.length === 0 && (
        <EmptyState
          title="Questa wishlist è vuota"
          description="Aggiungi carte dal catalogo, dalla ricerca globale o dalle mancanti di un binder."
          action={
            <Button href="/catalogo" variant="ember">
              Vai al catalogo
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.wishlist.items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {state.wishlist.items.map((item) => (
            <div key={item.id} className="relative">
              {item.card ? (
                <Card card={item.card} onClick={() => setSelectedCard(item.card)} />
              ) : (
                <div className="flex aspect-[5/7] items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-center text-sm text-foreground-muted">
                  {item.tcgdexCardId}
                </div>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="absolute right-2 top-2 z-10 shadow-sm"
                onClick={() => handleRemove(item.id)}
                disabled={removingId === item.id}
                aria-label={`Rimuovi ${item.card?.name ?? item.tcgdexCardId}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      {selectedCard && (
        <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </PageContainer>
  );
}
