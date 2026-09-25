"use client";

import { useCallback, useRef, useState } from "react";
import type { BinderSlot } from "@/lib/binders";
import type { SlotInsertAnimation } from "@/lib/slot-insert";
import { cardForInsert } from "@/lib/slot-insert";

function shouldAnimateInsert(previous: BinderSlot, next: BinderSlot): boolean {
  if (!next.tcgdexCardId || !next.card) return false;
  if (!previous.tcgdexCardId) return true;
  if (previous.tcgdexCardId !== next.tcgdexCardId) return true;
  if (previous.quantity === 0 && next.quantity >= 1) return true;
  return false;
}

type Options = {
  patchSlotLocal: (slot: BinderSlot) => void;
  /** Se lo slot non è sulla pagina corrente, sfoglia fino a mostrarlo. */
  revealSlotPage?: (slotId: string) => Promise<void>;
};

/**
 * Orchestra salvataggio → eventuale sfoglio → carta che scende nella busta.
 */
export function useSlotInsertOrchestrator({ patchSlotLocal, revealSlotPage }: Options) {
  const [insertAnimation, setInsertAnimation] = useState<SlotInsertAnimation | null>(null);
  const pendingRef = useRef<BinderSlot | null>(null);
  const busyRef = useRef(false);

  const commitSlotChange = useCallback(
    async (previous: BinderSlot, updated: BinderSlot) => {
      if (!shouldAnimateInsert(previous, updated)) {
        patchSlotLocal(updated);
        return;
      }

      if (busyRef.current) {
        patchSlotLocal(updated);
        return;
      }
      busyRef.current = true;

      if (revealSlotPage) {
        await revealSlotPage(updated.id);
      }

      // Busta "vuota" (o senza faccia) mentre la carta scende dall'apertura.
      const hollow: BinderSlot = {
        ...updated,
        tcgdexCardId: null,
        card: null,
        quantity: 0,
        condition: null,
      };
      patchSlotLocal(hollow);

      const face = cardForInsert(updated.card);
      pendingRef.current = updated;
      setInsertAnimation({
        slotId: updated.id,
        name: face.name,
        image: face.image,
      });
    },
    [patchSlotLocal, revealSlotPage],
  );

  const handleInsertComplete = useCallback(() => {
    if (!busyRef.current) return;
    if (pendingRef.current) {
      patchSlotLocal(pendingRef.current);
      pendingRef.current = null;
    }
    setInsertAnimation(null);
    busyRef.current = false;
  }, [patchSlotLocal]);

  return {
    insertAnimation,
    commitSlotChange,
    handleInsertComplete,
  };
}
