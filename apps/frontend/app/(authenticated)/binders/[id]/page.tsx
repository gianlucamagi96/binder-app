"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Heart, Trash2 } from "lucide-react";
import type { BinderSlot } from "@/lib/binders";
import { addToWishlist, bulkWishlistFromBinder, ensureDefaultWishlistId } from "@/lib/wishlist";
import { useBinderPage } from "@/hooks/useBinderPage";
import { useSlotInsertOrchestrator } from "@/hooks/useSlotInsertOrchestrator";
import { CardSkeleton } from "@/components/Card";
import { SlotEditorModal } from "@/components/SlotEditorModal";
import { BinderPageNavigator } from "@/components/BinderPageNavigator";
import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

export default function BinderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    state,
    navigating,
    goNext,
    goPrev,
    addPage,
    saveSlot,
    patchSlotLocal,
    revealSlotPage,
    removeBinder,
    reload,
  } = useBinderPage(params.id);
  const { insertAnimation, commitSlotChange, handleInsertComplete } =
    useSlotInsertOrchestrator({ patchSlotLocal, revealSlotPage });

  const [editingSlot, setEditingSlot] = useState<BinderSlot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [wishlistPendingSlotId, setWishlistPendingSlotId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [wishlistMessage, setWishlistMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Eliminare definitivamente questo binder? L'azione non si può annullare.")) return;
    setDeleting(true);
    await removeBinder();
    router.push("/binders");
  }

  async function handleAddToWishlist(slot: BinderSlot) {
    if (!slot.tcgdexCardId) return;
    setWishlistPendingSlotId(slot.id);
    setWishlistMessage(null);
    try {
      const wishlistId = await ensureDefaultWishlistId();
      await addToWishlist({ wishlistId, tcgdexCardId: slot.tcgdexCardId });
      setWishlistMessage(`${slot.card?.name ?? "Carta"} aggiunta alla wishlist`);
    } catch {
      setWishlistMessage("Impossibile aggiungere alla wishlist");
    } finally {
      setWishlistPendingSlotId(null);
    }
  }

  async function handleBulkWishlist() {
    setBulkPending(true);
    setWishlistMessage(null);
    try {
      const wishlistId = await ensureDefaultWishlistId();
      const result = await bulkWishlistFromBinder(wishlistId, params.id);
      if (result.total === 0) {
        setWishlistMessage("Nessuna carta mancante da aggiungere");
      } else if (result.added === 0) {
        setWishlistMessage(`Tutte le ${result.total} mancanti sono già in wishlist`);
      } else {
        setWishlistMessage(
          `Aggiunte ${result.added} di ${result.total} mancanti alla wishlist`,
        );
      }
    } catch {
      setWishlistMessage("Impossibile aggiungere le mancanti alla wishlist");
    } finally {
      setBulkPending(false);
    }
  }

  async function handleSaveSlot(
    input: { tcgdexCardId?: string | null; quantity?: number; condition?: string | null },
  ) {
    if (!editingSlot) return;
    const previous = editingSlot;
    const updated = await saveSlot(editingSlot.id, input);
    setEditingSlot(null);
    await commitSlotChange(previous, updated);
  }

  return (
    <PageContainer className="gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href="/binders"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            I miei binder
          </Link>
          {state.status === "ready" ? (
            <h1 className="font-display truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {state.binder.name}
            </h1>
          ) : state.status === "loading" ? (
            <Skeleton className="h-8 w-48" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.status === "ready" &&
            (state.binder.type === "EXPANSION" || state.binder.type === "ARTIST") && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkWishlist}
              disabled={bulkPending}
            >
              <Heart className="h-4 w-4" aria-hidden />
              {bulkPending
                ? "Aggiunta in corso..."
                : "Aggiungi tutte le mancanti alla wishlist"}
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {deleting ? "Eliminazione..." : "Elimina binder"}
          </Button>
        </div>
      </div>

      {wishlistMessage && (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-border bg-surface-hover px-3 py-2 text-sm text-foreground-secondary"
        >
          {wishlistMessage}
        </p>
      )}

      {state.status === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <EmptyState
          tone="error"
          title="Impossibile caricare il binder"
          action={
            <Button variant="secondary" onClick={reload}>
              Riprova
            </Button>
          }
        />
      )}

      {state.status === "ready" && (
        <BinderPageNavigator
          binder={state.binder}
          navigating={navigating}
          onNext={goNext}
          onPrev={goPrev}
          onAddPage={addPage}
          onSlotClick={insertAnimation ? () => undefined : setEditingSlot}
          onAddToWishlist={handleAddToWishlist}
          wishlistPendingSlotId={wishlistPendingSlotId}
          insertAnimation={insertAnimation}
          onInsertComplete={handleInsertComplete}
        />
      )}

      {editingSlot && (
        <SlotEditorModal
          slot={editingSlot}
          onClose={() => setEditingSlot(null)}
          onSave={handleSaveSlot}
        />
      )}
    </PageContainer>
  );
}
