"use client";

import { useEffect } from "react";
import { useDrag } from "@use-gesture/react";
import { Plus } from "lucide-react";
import type { BinderDetail, BinderSlot } from "@/lib/binders";
import type { SlotInsertAnimation } from "@/lib/slot-insert";
import { BinderPageFlip } from "@/components/BinderPageFlip";
import { Chevron } from "@/components/icons/Chevron";
import { Button } from "@/components/ui/Button";

type Props = {
  binder: BinderDetail;
  navigating: boolean;
  onNext: () => void;
  onPrev: () => void;
  onAddPage: () => void;
  onSlotClick: (slot: BinderSlot) => void;
  onAddToWishlist?: (slot: BinderSlot) => void;
  wishlistPendingSlotId?: string | null;
  insertAnimation?: SlotInsertAnimation | null;
  onInsertComplete?: () => void;
  keyboardEnabled?: boolean;
};

export function BinderPageNavigator({
  binder,
  navigating,
  onNext,
  onPrev,
  onAddPage,
  onSlotClick,
  onAddToWishlist,
  wishlistPendingSlotId,
  insertAnimation,
  onInsertComplete,
  keyboardEnabled = true,
}: Props) {
  useEffect(() => {
    if (!keyboardEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") onNext();
      if (event.key === "ArrowLeft") onPrev();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardEnabled, onNext, onPrev]);

  const bindDrag = useDrag(
    ({ swipe: [swipeX] }) => {
      if (swipeX === 1) onPrev();
      if (swipeX === -1) onNext();
    },
    { axis: "x", filterTaps: true, swipe: { distance: 50, velocity: 0.3 } },
  );

  const canGoPrev = binder.page.pageNumber > 1 && !navigating;
  const canGoNext = binder.page.pageNumber < binder.totalPages && !navigating;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <Button size="sm" onClick={onPrev} disabled={!canGoPrev || !!insertAnimation} aria-label="Pagina precedente">
          <Chevron direction="left" />
          <span className="hidden sm:inline">Indietro</span>
        </Button>
        <span className="min-w-[4.5rem] rounded-full bg-surface-hover px-3 py-1.5 text-center font-mono text-sm tabular-nums text-foreground-secondary">
          {binder.page.pageNumber} / {binder.totalPages}
        </span>
        <Button size="sm" onClick={onNext} disabled={!canGoNext || !!insertAnimation} aria-label="Pagina successiva">
          <span className="hidden sm:inline">Avanti</span>
          <Chevron direction="right" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onAddPage} disabled={navigating || !!insertAnimation}>
          <Plus className="h-4 w-4" aria-hidden />
          Pagina
        </Button>
      </div>

      <div {...bindDrag()} className="touch-pan-y">
        <BinderPageFlip
          pageNumber={binder.page.pageNumber}
          cols={binder.cols}
          slots={binder.page.slots}
          onSlotClick={onSlotClick}
          onAddToWishlist={onAddToWishlist}
          wishlistPendingSlotId={wishlistPendingSlotId}
          insertAnimation={insertAnimation}
          onInsertComplete={onInsertComplete}
        />
      </div>
    </div>
  );
}
