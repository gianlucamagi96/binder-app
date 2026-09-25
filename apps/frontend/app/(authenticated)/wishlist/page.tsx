"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Plus } from "lucide-react";
import type { WishlistSummary } from "@/lib/wishlist";
import { createWishlist, fetchWishlists } from "@/lib/wishlist";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; wishlists: WishlistSummary[] };

export default function WishlistsPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchWishlists()
      .then((wishlists) => setState({ status: "ready", wishlists }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Inserisci un nome");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const created = await createWishlist(trimmed);
      setName("");
      setShowForm(false);
      setState((prev) =>
        prev.status === "ready"
          ? { status: "ready", wishlists: [...prev.wishlists, created] }
          : { status: "ready", wishlists: [created] },
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Creazione fallita");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageContainer className="gap-8">
      <PageHeader
        eyebrow="Le tue liste"
        title="Wishlist"
        description="Crea più liste desiderata e organizza le carte che cerchi."
        action={
          <Button variant="ember" onClick={() => setShowForm((open) => !open)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nuova wishlist
          </Button>
        }
      />

      {showForm && (
        <Panel className="flex flex-col gap-3 p-4 sm:max-w-md">
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <Input
              label="Nome"
              placeholder="Es. Want list SV, Chase cards…"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {formError && (
              <p className="text-sm text-danger-foreground">{formError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="ember" disabled={creating}>
                {creating ? "Creazione..." : "Crea"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setFormError(null);
                }}
              >
                Annulla
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {state.status === "loading" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <EmptyState
          tone="error"
          title="Impossibile caricare le wishlist"
          action={
            <Button variant="secondary" onClick={load}>
              Riprova
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.wishlists.length === 0 && (
        <EmptyState
          icon={<Heart className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
          title="Nessuna wishlist ancora"
          description="Crea la tua prima lista e aggiungi carte dal catalogo o dai binder."
          action={
            <Button variant="ember" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Crea wishlist
            </Button>
          }
        />
      )}

      {state.status === "ready" && state.wishlists.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {state.wishlists.map((wishlist) => (
            <Link
              key={wishlist.id}
              href={`/wishlist/${wishlist.id}`}
              className="group block"
            >
              <Panel
                interactive
                className="flex h-full flex-col gap-3 p-4 transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5"
              >
                <div className="grid h-24 grid-cols-4 gap-1.5 overflow-hidden rounded-[var(--radius-md)] bg-background/60 p-1.5">
                  {wishlist.coverImages.length > 0
                    ? wishlist.coverImages.slice(0, 4).map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${wishlist.id}-${i}`}
                          src={src}
                          alt=""
                          className="h-full w-full rounded object-contain"
                        />
                      ))
                    : Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded bg-surface-hover"
                          aria-hidden
                        />
                      ))}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate font-display text-base font-semibold text-foreground">
                    {wishlist.name}
                  </p>
                  <p className="font-mono text-xs text-foreground-muted">
                    {wishlist.itemCount} cart{wishlist.itemCount === 1 ? "a" : "e"}
                  </p>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
