"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { FeaturedCard } from "@/lib/catalog";
import type { BinderListItem, BinderSlot } from "@/lib/binders";
import { useBinderPage } from "@/hooks/useBinderPage";
import { useSlotInsertOrchestrator } from "@/hooks/useSlotInsertOrchestrator";
import { BinderPageNavigator } from "@/components/BinderPageNavigator";
import { CardDetailModal } from "@/components/CardDetailModal";
import { SlotEditorModal } from "@/components/SlotEditorModal";
import { CardSkeleton } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export function BinderOverlay({
  binder,
  onClose,
}: {
  binder: BinderListItem;
  onClose: () => void;
}) {
  const {
    state,
    navigating,
    goNext,
    goPrev,
    addPage,
    saveSlot,
    patchSlotLocal,
    revealSlotPage,
    reload,
  } = useBinderPage(binder.id);
  const { insertAnimation, commitSlotChange, handleInsertComplete } =
    useSlotInsertOrchestrator({ patchSlotLocal, revealSlotPage });

  const [editingSlot, setEditingSlot] = useState<BinderSlot | null>(null);
  const [detailCard, setDetailCard] = useState<FeaturedCard | null>(null);
  const [isMorphing, setIsMorphing] = useState(true);
  const backdropRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !editingSlot && !detailCard && !insertAnimation) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, editingSlot, detailCard, insertAnimation]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === backdropRef.current && !insertAnimation) {
      onClose();
    }
  }

  async function handleSaveSlot(input: {
    tcgdexCardId?: string | null;
    quantity?: number;
    condition?: string | null;
  }) {
    if (!editingSlot) return;
    const previous = editingSlot;
    const updated = await saveSlot(editingSlot.id, input);
    setEditingSlot(null);
    await commitSlotChange(previous, updated);
  }

  return (
    <motion.div
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={binder.name}
      className="fixed inset-0 z-50 flex items-end justify-center bg-backdrop p-0 sm:items-stretch sm:p-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.05 : 0.2 }}
    >
      <motion.div
        layoutId={`binder-card-${binder.id}`}
        transition={reduceMotion ? { duration: 0 } : undefined}
        onLayoutAnimationStart={() => setIsMorphing(true)}
        onLayoutAnimationComplete={() => setIsMorphing(false)}
        className={`flex max-h-[92dvh] w-full flex-1 flex-col gap-5 overflow-y-auto rounded-t-[var(--radius-xl)] border border-border bg-surface p-5 shadow-lg sm:max-h-none sm:rounded-none sm:border-0 sm:p-6 lg:p-8 ${
          isMorphing && !reduceMotion ? "will-change-transform" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Binder
            </p>
            <h2 className="font-display truncate text-xl font-semibold tracking-tight text-foreground">
              {binder.name}
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
            onSlotClick={
              insertAnimation
                ? () => undefined
                : (slot) => {
                    if (slot.card) {
                      setEditingSlot(null);
                      setDetailCard(slot.card);
                    } else {
                      setDetailCard(null);
                      setEditingSlot(slot);
                    }
                  }
            }
            insertAnimation={insertAnimation}
            onInsertComplete={handleInsertComplete}
          />
        )}
      </motion.div>

      {detailCard && (
        <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
      )}

      {editingSlot && (
        <SlotEditorModal
          slot={editingSlot}
          onClose={() => setEditingSlot(null)}
          onSave={handleSaveSlot}
        />
      )}
    </motion.div>
  );
}
