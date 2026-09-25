"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Heart,
  Layers,
  Loader2,
  Search,
  Sparkles,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import type { CardSearchResult, Expansion, FeaturedCard } from "@/lib/catalog";
import {
  fetchExpansions,
  searchCatalogCards,
  searchResultToFeaturedCard,
} from "@/lib/catalog";
import { addToWishlist, ensureDefaultWishlistId } from "@/lib/wishlist";
import { CardDetailModal } from "@/components/CardDetailModal";
import { Badge } from "@/components/ui/Badge";

const RECENT_KEY = "binder.commandSearch.recent";
const MAX_RECENT = 6;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CardStatus = "idle" | "loading" | "ready" | "error";
type ExpansionStatus = "idle" | "loading" | "ready" | "error";

function loadRecent(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...loadRecent().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT,
  );
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground-muted">
      {children}
    </kbd>
  );
}

export function CommandSearch({ open, onOpenChange }: Props) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  const [cardResults, setCardResults] = useState<CardSearchResult[]>([]);
  const [cardStatus, setCardStatus] = useState<CardStatus>("idle");
  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [expansionStatus, setExpansionStatus] = useState<ExpansionStatus>("idle");

  const [wishlistPendingId, setWishlistPendingId] = useState<string | null>(null);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [detailCard, setDetailCard] = useState<FeaturedCard | null>(null);

  const canSearchCards = debouncedQuery.length >= 2;
  const canSearchExpansions = debouncedQuery.length >= 1;
  const isSearching = debouncedQuery.length > 0;

  const close = useCallback(() => {
    if (detailCard) {
      setDetailCard(null);
      return;
    }
    onOpenChange(false);
  }, [detailCard, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setCardResults([]);
      setExpansions([]);
      setCardStatus("idle");
      setExpansionStatus("idle");
      setFeedback(null);
      setDetailCard(null);
      return;
    }
    setRecent(loadRecent());
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (!canSearchCards) {
      setCardResults([]);
      setCardStatus("idle");
      return;
    }
    let cancelled = false;
    setCardStatus("loading");
    searchCatalogCards(debouncedQuery, { limit: 16, page: 1 })
      .then((data) => {
        if (!cancelled) {
          setCardResults(data.items);
          setCardStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCardResults([]);
          setCardStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canSearchCards, debouncedQuery, open]);

  useEffect(() => {
    if (!open) return;
    if (!canSearchExpansions) {
      setExpansions([]);
      setExpansionStatus("idle");
      return;
    }
    let cancelled = false;
    setExpansionStatus("loading");
    fetchExpansions({ limit: 8, q: debouncedQuery })
      .then((page) => {
        if (!cancelled) {
          setExpansions(page.items);
          setExpansionStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExpansions([]);
          setExpansionStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canSearchExpansions, debouncedQuery, open]);

  function rememberQuery() {
    if (debouncedQuery.length >= 2) {
      saveRecent(debouncedQuery);
      setRecent(loadRecent());
    }
  }

  function openCardDetail(result: CardSearchResult) {
    rememberQuery();
    setDetailCard(searchResultToFeaturedCard(result));
  }

  function openExpansion(expansion: Expansion) {
    rememberQuery();
    onOpenChange(false);
    router.push(`/catalogo/espansioni/${encodeURIComponent(expansion.id)}`);
  }

  function goTo(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  async function handleWishlist(result: CardSearchResult) {
    setWishlistPendingId(result.id);
    setFeedback(null);
    try {
      const wishlistId = await ensureDefaultWishlistId();
      await addToWishlist({ wishlistId, tcgdexCardId: result.id });
      setWishlistedIds((prev) => new Set(prev).add(result.id));
      setFeedback({ tone: "ok", text: `${result.name} aggiunta alla wishlist` });
    } catch {
      setFeedback({ tone: "error", text: "Impossibile aggiungere alla wishlist" });
    } finally {
      setWishlistPendingId(null);
    }
  }

  const loading = cardStatus === "loading" || expansionStatus === "loading";
  const showEmptyCards =
    canSearchCards && cardStatus === "ready" && cardResults.length === 0;
  const showEmptyExpansions =
    canSearchExpansions && expansionStatus === "ready" && expansions.length === 0;

  return (
    <>
      <AnimatePresence>
        {open && (
            <motion.div
              key="command-search-panel"
              className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[max(4rem,8vh)] sm:px-4"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
            <button
              type="button"
              aria-label="Chiudi ricerca"
              className="absolute inset-0 bg-backdrop backdrop-blur-[2px]"
              onClick={() => onOpenChange(false)}
            />

            <motion.div
              role="presentation"
              initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-full max-w-2xl"
            >
              <Command
                shouldFilter={false}
                label="Ricerca globale"
                className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-lg"
              >
                <div className="flex items-center gap-3 border-b border-border px-4">
                  <Search className="h-5 w-5 shrink-0 text-accent-text" strokeWidth={1.75} aria-hidden />
                  <Command.Input
                    ref={inputRef}
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Cerca carte o espansioni…"
                    className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-foreground-muted"
                  />
                  {loading ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-foreground-muted"
                      aria-hidden
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="hidden shrink-0 sm:inline-flex"
                      aria-label="Chiudi"
                    >
                      <Kbd>Esc</Kbd>
                    </button>
                  )}
                </div>

                <Command.List className="max-h-[min(28rem,58vh)] overflow-y-auto overscroll-contain p-2">
                  {!isSearching && (
                    <div className="flex flex-col gap-3 p-2">
                      <div className="rounded-[var(--radius-lg)] border border-border/80 bg-background/40 px-4 py-5 text-center">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                          <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          Cerca nel catalogo TCGdex
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                          Digita un nome carta (min. 2 caratteri) o un&apos;espansione.
                        </p>
                      </div>

                      {recent.length > 0 && (
                        <Command.Group
                          heading="Ricerche recenti"
                          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-muted"
                        >
                          {recent.map((item) => (
                            <Command.Item
                              key={item}
                              value={`recent-${item}`}
                              onSelect={() => setQuery(item)}
                              className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-foreground data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-text"
                            >
                              <Clock className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                              <span className="truncate">{item}</span>
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}

                      <Command.Group
                        heading="Scorciatoie"
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-muted"
                      >
                        {[
                          { href: "/catalogo", label: "Apri catalogo", icon: Layers },
                          { href: "/binders", label: "I miei binder", icon: BookOpen },
                          { href: "/wishlist", label: "Wishlist", icon: Heart },
                        ].map(({ href, label, icon: Icon }) => (
                          <Command.Item
                            key={href}
                            value={`nav-${href}`}
                            onSelect={() => goTo(href)}
                            className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-foreground data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-text"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                            <span className="flex-1">{label}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    </div>
                  )}

                  {isSearching && query.trim().length === 1 && (
                    <p className="px-3 py-2 text-xs text-foreground-muted">
                      Un altro carattere per includere anche le carte.
                    </p>
                  )}

                  {/* Carte */}
                  {canSearchCards && (
                    <Command.Group
                      heading={
                        cardStatus === "ready"
                          ? `Carte · ${cardResults.length}`
                          : "Carte"
                      }
                      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-muted"
                    >
                      {cardStatus === "loading" &&
                        Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2"
                          >
                            <div className="h-14 w-10 animate-pulse rounded-[var(--radius-sm)] bg-surface-hover" />
                            <div className="flex flex-1 flex-col gap-2">
                              <div className="h-3 w-2/3 animate-pulse rounded bg-surface-hover" />
                              <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
                            </div>
                          </div>
                        ))}

                      {cardStatus === "error" && (
                        <p className="px-3 py-4 text-sm text-danger-foreground">
                          Ricerca carte non riuscita. Riprova tra poco.
                        </p>
                      )}

                      {showEmptyCards && (
                        <p className="px-3 py-4 text-sm text-foreground-muted">
                          Nessuna carta per «{debouncedQuery}».
                        </p>
                      )}

                      {cardResults.map((result) => {
                        const inWishlist = wishlistedIds.has(result.id);
                        return (
                          <Command.Item
                            key={result.id}
                            value={`card-${result.id}-${result.name}`}
                            onSelect={() => openCardDetail(result)}
                            className="group flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent-soft"
                          >
                            <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-background shadow-xs">
                              {result.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={result.image}
                                  alt=""
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span className="text-[9px] text-foreground-muted">N/A</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-foreground">
                                {result.name}
                              </p>
                              <p className="truncate text-xs text-foreground-muted">
                                {result.set?.name ?? "Espansione sconosciuta"}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-data-[selected=true]:opacity-100 sm:group-hover:opacity-100">
                              {result.set?.id && (
                                <button
                                  type="button"
                                  title="Apri espansione"
                                  aria-label={`Apri espansione di ${result.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    rememberQuery();
                                    onOpenChange(false);
                                    router.push(
                                      `/catalogo/espansioni/${encodeURIComponent(result.set!.id)}?card=${encodeURIComponent(result.id)}`,
                                    );
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-foreground-muted transition-colors hover:bg-surface hover:text-accent-text"
                                >
                                  <Layers className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Aggiungi alla wishlist"
                                aria-label={`Aggiungi ${result.name} alla wishlist`}
                                disabled={wishlistPendingId === result.id || inWishlist}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleWishlist(result);
                                }}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-surface disabled:opacity-50 ${
                                  inWishlist
                                    ? "text-accent-text"
                                    : "text-foreground-muted hover:text-accent-text"
                                }`}
                              >
                                <Heart
                                  className="h-3.5 w-3.5"
                                  strokeWidth={inWishlist ? 0 : 2}
                                  fill={inWishlist ? "currentColor" : "none"}
                                  aria-hidden
                                />
                              </button>
                            </div>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  )}

                  {/* Espansioni */}
                  {canSearchExpansions && (
                    <Command.Group
                      heading={
                        expansionStatus === "ready"
                          ? `Espansioni · ${expansions.length}`
                          : "Espansioni"
                      }
                      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-muted"
                    >
                      {expansionStatus === "loading" &&
                        Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2"
                          >
                            <div className="h-10 w-16 animate-pulse rounded bg-surface-hover" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
                          </div>
                        ))}

                      {expansionStatus === "error" && (
                        <p className="px-3 py-4 text-sm text-danger-foreground">
                          Ricerca espansioni non riuscita.
                        </p>
                      )}

                      {showEmptyExpansions && (
                        <p className="px-3 py-4 text-sm text-foreground-muted">
                          Nessuna espansione per «{debouncedQuery}».
                        </p>
                      )}

                      {expansions.map((expansion) => (
                        <Command.Item
                          key={expansion.id}
                          value={`set-${expansion.id}-${expansion.name}`}
                          onSelect={() => openExpansion(expansion)}
                          className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2 py-2.5 text-sm outline-none data-[selected=true]:bg-accent-soft"
                        >
                          <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-background px-1">
                            {expansion.logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={expansion.logo}
                                alt=""
                                className="max-h-8 max-w-full object-contain"
                              />
                            ) : (
                              <Layers className="h-4 w-4 text-foreground-muted" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">
                              {expansion.name}
                            </p>
                            <p className="truncate text-xs text-foreground-muted">
                              {expansion.serie.name}
                            </p>
                          </div>
                          <Badge mono tone="neutral">
                            {expansion.cardCount.total}
                          </Badge>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </Command.List>

                {feedback && (
                  <p
                    role="status"
                    className={`border-t border-border px-4 py-2 text-xs ${
                      feedback.tone === "ok"
                        ? "text-foreground-secondary"
                        : "text-danger-foreground"
                    }`}
                  >
                    {feedback.text}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-background/40 px-4 py-2.5 text-[11px] text-foreground-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                    naviga
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>↵</Kbd>
                    apri
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>Esc</Kbd>
                    chiudi
                  </span>
                  <button
                    type="button"
                    onClick={() => goTo("/catalogo")}
                    className="ml-auto font-medium text-accent-text hover:underline"
                  >
                    Catalogo completo
                  </button>
                </div>
              </Command>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {detailCard && (
        <CardDetailModal
          card={detailCard}
          onClose={() => {
            setDetailCard(null);
            // Riapri focus sulla ricerca dopo il dettaglio
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
