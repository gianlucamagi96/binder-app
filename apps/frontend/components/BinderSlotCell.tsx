"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Heart, Plus } from "lucide-react";
import type { BinderSlot } from "@/lib/binders";
import { slotState } from "@/lib/binders";
import type { SlotInsertAnimation } from "@/lib/slot-insert";

type Props = {
  slot: BinderSlot;
  onClick: () => void;
  onAddToWishlist?: (slot: BinderSlot) => void;
  wishlistPending?: boolean;
  insertAnimation?: SlotInsertAnimation | null;
  onInsertComplete?: () => void;
};

export function BinderSlotCell({
  slot,
  onClick,
  onAddToWishlist,
  wishlistPending = false,
  insertAnimation = null,
  onInsertComplete,
}: Props) {
  const reduceMotion = useReducedMotion();
  const state = slotState(slot);
  const isInserting = insertAnimation?.slotId === slot.id;
  const showWishlist = state === "missing" && !isInserting && onAddToWishlist && slot.tcgdexCardId;

  // Durante l'inserimento la busta resta "vuota" e la carta scende dall'alto.
  const showCardFace = !isInserting && state !== "empty" && slot.card;
  const label =
    (isInserting ? insertAnimation?.name : null) ??
    slot.card?.name ??
    (state === "empty" ? "Slot vuoto" : null);

  return (
    <div className="group relative flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={
          state === "empty"
            ? "Aggiungi una carta a questo slot"
            : `Dettaglio ${slot.card?.name ?? "carta"}`
        }
        className="relative min-h-[44px] w-full text-left transition-transform duration-150 active:scale-[0.98]"
      >
        {/* Busta: apertura sul lato superiore, bordi laterali/fondo chiusi. */}
        <div
          className={`relative aspect-[5/7] overflow-hidden rounded-[var(--radius-md)] border border-border-strong bg-[color-mix(in_oklab,var(--color-surface)_70%,#000_30%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-8px_16px_rgba(0,0,0,0.35)] ${
            state === "empty" && !isInserting
              ? "border-dashed border-border-strong"
              : "border-solid"
          }`}
        >
          {/* Labbro superiore = apertura della busta */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-2.5 bg-gradient-to-b from-black/45 via-black/15 to-transparent"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-[10%] top-0 z-20 h-[2px] rounded-b-full bg-border-strong/80 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            aria-hidden
          />

          {/* Area interna: overflow hidden così la carta "entra" nella busta */}
          <div className="absolute inset-[4px] overflow-hidden rounded-[calc(var(--radius-md)-2px)] bg-background/40">
            {isInserting && (
              <motion.div
                className="absolute inset-0 z-10 flex items-center justify-center will-change-transform"
                initial={
                  reduceMotion
                    ? { y: "0%", opacity: 1 }
                    : { y: "-140%", opacity: 0.8, rotate: -3 }
                }
                animate={
                  reduceMotion
                    ? { y: "0%", opacity: 1, rotate: 0 }
                    : {
                        // Slide lungo dall'alto, poi un ultimo affondo nella busta.
                        y: ["-140%", "10%", "0%"],
                        opacity: [0.8, 1, 1],
                        rotate: [-3, 0.6, 0],
                      }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.01 }
                    : {
                        duration: 1.25,
                        times: [0, 0.72, 1],
                        ease: [
                          [0.4, 0, 0.2, 1],
                          [0.22, 1, 0.36, 1],
                        ],
                      }
                }
                onAnimationComplete={() => onInsertComplete?.()}
              >
                <CardFace
                  name={insertAnimation!.name}
                  image={insertAnimation!.image}
                  grayscale={false}
                />
              </motion.div>
            )}

            {!isInserting && state === "empty" && (
              <div className="flex h-full w-full items-center justify-center text-foreground-muted transition-colors duration-150 group-hover:text-accent-text">
                <Plus
                  className="h-6 w-6 opacity-45 transition-opacity duration-150 group-hover:opacity-100"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
            )}

            {showCardFace && (
              <div
                className={`absolute inset-0 ${
                  state === "missing" ? "opacity-70 grayscale" : ""
                } transition-[filter,opacity] duration-200 group-hover:opacity-100 group-hover:grayscale-0`}
              >
                <CardFace
                  name={slot.card!.name}
                  image={slot.card!.image}
                  grayscale={false}
                />
              </div>
            )}
          </div>

          {/* Cornice frontale della busta (lati + fondo) */}
          <div
            className="pointer-events-none absolute inset-0 z-30 rounded-[var(--radius-md)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),inset_3px_0_8px_rgba(0,0,0,0.2),inset_-3px_0_8px_rgba(0,0,0,0.2),inset_0_-6px_12px_rgba(0,0,0,0.28)]"
            aria-hidden
          />
        </div>
      </button>

      {label && state !== "empty" && !isInserting && (
        <p className="truncate px-0.5 text-center text-[11px] font-medium text-foreground-muted">
          {label}
        </p>
      )}

      {showWishlist && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddToWishlist(slot);
          }}
          disabled={wishlistPending}
          aria-label={`Aggiungi ${slot.card?.name ?? "carta"} alla wishlist`}
          className="absolute right-1 top-1 z-40 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-accent-text shadow-sm transition-[opacity,transform,background-color] duration-150 hover:bg-accent-soft active:scale-95 disabled:opacity-50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        >
          <Heart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

function CardFace({
  name,
  image,
  grayscale,
}: {
  name: string;
  image: string | null;
  grayscale: boolean;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        className={`h-full w-full object-contain ${grayscale ? "grayscale" : ""}`}
        draggable={false}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface px-2 text-center text-[10px] font-medium text-foreground-muted">
      {name}
    </div>
  );
}
