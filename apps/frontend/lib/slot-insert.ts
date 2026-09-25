import type { FeaturedCard } from "@/lib/catalog";

/** Carta in ingresso nella busta: immagine + nome per l'animazione di inserimento. */
export type SlotInsertAnimation = {
  slotId: string;
  name: string;
  image: string | null;
};

/** Durata dell'inserimento (allineata a framer-motion in BinderSlotCell). */
export const SLOT_INSERT_MS = 1250;

/** Attesa dopo lo sfoglio pagina prima di far scendere la carta. */
export const AFTER_PAGE_FLIP_MS = 520;

export function cardForInsert(card: FeaturedCard | null | undefined, fallbackName?: string): {
  name: string;
  image: string | null;
} {
  return {
    name: card?.name ?? fallbackName ?? "Carta",
    image: card?.image ?? null,
  };
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
