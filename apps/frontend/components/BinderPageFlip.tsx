"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { BinderSlot } from "@/lib/binders";
import type { SlotInsertAnimation } from "@/lib/slot-insert";
import { BinderPageGrid } from "@/components/BinderPageGrid";

// Durata di UNA metà dello sfoglio: la pagina uscente ruota 0→90° in questo
// tempo, poi (mode="wait" fa aspettare il completamento dell'uscita) quella
// entrante ruota -90°→0° nello stesso tempo. Il "click" percepito dello
// sfoglio dura quindi il doppio di questo valore.
const HALF_FLIP_DURATION = 0.22;

export function BinderPageFlip({
  pageNumber,
  cols,
  slots,
  onSlotClick,
  onAddToWishlist,
  wishlistPendingSlotId,
  insertAnimation,
  onInsertComplete,
}: {
  pageNumber: number;
  cols: number;
  slots: BinderSlot[];
  onSlotClick: (slot: BinderSlot) => void;
  onAddToWishlist?: (slot: BinderSlot) => void;
  wishlistPendingSlotId?: string | null;
  insertAnimation?: SlotInsertAnimation | null;
  onInsertComplete?: () => void;
}) {
  // will-change va applicato solo mentre l'animazione è davvero in corso:
  // fuori da quella finestra la classe viene rimossa per non forzare un
  // livello di compositing extra sul resto della pagina.
  const [isAnimating, setIsAnimating] = useState(false);
  // prefers-reduced-motion: niente rotazione 3D, solo un cambio di
  // contenuto quasi istantaneo (piccolo crossfade, non un salto secco).
  const reduceMotion = useReducedMotion();

  const variants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { rotateY: -90, opacity: 0.3 },
        animate: { rotateY: 0, opacity: 1 },
        exit: { rotateY: 90, opacity: 0.3 },
      };

  return (
    <div style={{ perspective: reduceMotion ? undefined : 1600 }} className="w-full">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pageNumber}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ duration: reduceMotion ? 0.1 : HALF_FLIP_DURATION, ease: "easeInOut" }}
          onAnimationStart={() => setIsAnimating(true)}
          onAnimationComplete={() => setIsAnimating(false)}
          style={
            reduceMotion
              ? undefined
              : { transformStyle: "preserve-3d", backfaceVisibility: "hidden" }
          }
          className={isAnimating && !reduceMotion ? "will-change-transform" : undefined}
        >
          <BinderPageGrid
            cols={cols}
            slots={slots}
            onSlotClick={onSlotClick}
            onAddToWishlist={onAddToWishlist}
            wishlistPendingSlotId={wishlistPendingSlotId}
            insertAnimation={insertAnimation}
            onInsertComplete={onInsertComplete}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
