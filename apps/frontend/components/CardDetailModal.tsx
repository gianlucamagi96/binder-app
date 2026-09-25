"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { BookMarked, Heart, X } from "lucide-react";
import type { FeaturedCard } from "@/lib/catalog";
import type { BinderListItem } from "@/lib/binders";
import { addCardToBinder, fetchBinders } from "@/lib/binders";
import type { WishlistSummary } from "@/lib/wishlist";
import {
  addToWishlist,
  createWishlist,
  fetchWishlists,
} from "@/lib/wishlist";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";

const CONDITION_OPTIONS = [
  { value: "", label: "Non specificata" },
  { value: "NM", label: "NM — Near Mint" },
  { value: "EX", label: "EX — Excellent" },
  { value: "GD", label: "GD — Good" },
  { value: "LP", label: "LP — Light Played" },
  { value: "PL", label: "PL — Played" },
  { value: "PO", label: "PO — Poor" },
];

type Props = {
  card: FeaturedCard;
  onClose: () => void;
};

export function CardDetailModal({ card, onClose }: Props) {
  const titleId = useId();
  const [binders, setBinders] = useState<BinderListItem[] | null>(null);
  const [bindersError, setBindersError] = useState(false);
  const [binderId, setBinderId] = useState("");
  const [wishlists, setWishlists] = useState<WishlistSummary[] | null>(null);
  const [wishlistId, setWishlistId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState("");
  const [busy, setBusy] = useState<"wishlist" | "binder" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchBinders()
      .then((list) => {
        if (cancelled) return;
        setBinders(list);
        if (list.length === 1) setBinderId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) {
          setBinders([]);
          setBindersError(true);
        }
      });

    fetchWishlists()
      .then(async (list) => {
        if (cancelled) return;
        if (list.length === 0) {
          const created = await createWishlist("Wishlist");
          if (cancelled) return;
          setWishlists([created]);
          setWishlistId(created.id);
          return;
        }
        setWishlists(list);
        setWishlistId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setWishlists([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleWishlist() {
    if (!wishlistId) {
      setFeedback({ tone: "error", text: "Seleziona una wishlist" });
      return;
    }
    setBusy("wishlist");
    setFeedback(null);
    try {
      await addToWishlist({ wishlistId, tcgdexCardId: card.id });
      const listName = wishlists?.find((w) => w.id === wishlistId)?.name ?? "wishlist";
      setFeedback({ tone: "ok", text: `Aggiunta a «${listName}»` });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Impossibile aggiungere alla wishlist",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleAddToBinder() {
    if (!binderId) {
      setFeedback({ tone: "error", text: "Seleziona un binder" });
      return;
    }
    setBusy("binder");
    setFeedback(null);
    try {
      const result = await addCardToBinder(binderId, card.id, {
        quantity,
        condition: condition || null,
      });
      const binderName = binders?.find((b) => b.id === binderId)?.name ?? "binder";
      setFeedback({
        tone: "ok",
        text:
          result.mode === "checklist"
            ? `Segnata come posseduta in «${binderName}» (pag. ${result.pageNumber})`
            : `Inserita in «${binderName}» (pag. ${result.pageNumber})`,
      });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Impossibile aggiungere al binder",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-backdrop p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Panel
        elevated
        className="flex max-h-[92dvh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-t-[var(--radius-xl)] p-5 sm:rounded-[var(--radius-xl)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Dettaglio carta
            </p>
            <h2
              id={titleId}
              className="font-display truncate text-xl font-semibold tracking-tight text-foreground"
            >
              {card.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-background shadow-card sm:mx-0 sm:w-44">
            <div className="relative aspect-[5/7]">
              {card.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.image}
                  alt={card.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs text-foreground-muted">
                  {card.name}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              {card.set.id ? (
                <Link
                  href={`/catalogo/espansioni/${encodeURIComponent(card.set.id)}?card=${encodeURIComponent(card.id)}`}
                  className="text-sm font-medium text-accent-text hover:underline"
                  onClick={onClose}
                >
                  {card.set.name}
                </Link>
              ) : (
                <p className="text-sm text-foreground-muted">{card.set.name}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {card.rarity && <Badge tone="accent">{card.rarity}</Badge>}
                {card.hp !== null && (
                  <Badge mono tone="neutral">
                    HP {card.hp}
                  </Badge>
                )}
                {card.types.map((type) => (
                  <Badge key={type} tone="neutral">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {wishlists && wishlists.length > 0 && (
                <Select
                  label="Wishlist"
                  value={wishlistId}
                  onChange={(event) => setWishlistId(event.target.value)}
                >
                  {wishlists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                variant="secondary"
                onClick={handleWishlist}
                disabled={busy !== null || !wishlistId}
                className="w-full sm:w-auto"
              >
                <Heart className="h-4 w-4" aria-hidden />
                {busy === "wishlist" ? "Aggiunta..." : "Aggiungi alla wishlist"}
              </Button>
              {wishlists && wishlists.length === 0 && (
                <Button href="/wishlist" size="sm" variant="ghost" onClick={onClose}>
                  Crea una wishlist
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-background/50 p-4">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-foreground-muted" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Aggiungi a un binder</p>
          </div>

          {binders === null && (
            <p className="text-sm text-foreground-muted">Caricamento binder...</p>
          )}

          {bindersError && (
            <p className="text-sm text-danger-foreground">Impossibile caricare i binder.</p>
          )}

          {binders && binders.length === 0 && !bindersError && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-foreground-muted">
                Non hai ancora un binder. Creane uno per inserire questa carta.
              </p>
              <Button href="/binders/new" variant="ember" size="sm" onClick={onClose}>
                Crea binder
              </Button>
            </div>
          )}

          {binders && binders.length > 0 && (
            <>
              <Select
                label="Binder"
                value={binderId}
                onChange={(event) => setBinderId(event.target.value)}
              >
                <option value="">Seleziona un binder…</option>
                {binders.map((binder) => (
                  <option key={binder.id} value={binder.id}>
                    {binder.name}
                    {binder.type === "EXPANSION"
                      ? " · espansione"
                      : binder.type === "ARTIST"
                        ? " · artista"
                        : ""}
                  </option>
                ))}
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Quantità"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className="font-mono"
                />
                <Select
                  label="Condizione"
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                >
                  {CONDITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <Button
                variant="ember"
                onClick={handleAddToBinder}
                disabled={busy !== null || !binderId}
              >
                <BookMarked className="h-4 w-4" aria-hidden />
                {busy === "binder" ? "Inserimento..." : "Aggiungi al binder"}
              </Button>
            </>
          )}
        </div>

        {feedback && (
          <p
            role="status"
            className={`rounded-[var(--radius-md)] px-3 py-2 text-sm ${
              feedback.tone === "ok"
                ? "border border-border bg-surface-hover text-foreground-secondary"
                : "bg-danger-soft text-danger-foreground"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </Panel>
    </div>
  );
}
