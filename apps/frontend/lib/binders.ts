import type { FeaturedCard } from "@/lib/catalog";

export type BinderType = "GAME" | "EXPANSION" | "FREE" | "ARTIST";

export type BinderListItem = {
  id: string;
  name: string;
  type: BinderType;
  tcgGameCode: string | null;
  rows: number;
  cols: number;
  coverStyle: string | null;
  createdAt: string;
  totalPages: number;
  completion: number | null;
  cover: { image: string | null; logo: string | null };
};

export type BinderSlot = {
  id: string;
  position: number;
  tcgdexCardId: string | null;
  quantity: number;
  condition: string | null;
  card: FeaturedCard | null;
};

export type BinderDetail = {
  id: string;
  name: string;
  type: BinderType;
  tcgGameCode: string | null;
  rows: number;
  cols: number;
  coverStyle: string | null;
  createdAt: string;
  expansionIds: string[];
  totalPages: number;
  page: { pageNumber: number; slots: BinderSlot[] };
};

export type CardSearchResult = {
  id: string;
  name: string;
  image: string | null;
  set?: { id: string; name: string } | null;
};

// Stato visivo di uno slot, derivato interamente da tcgdexCardId/quantity:
// nessun campo separato "posseduto" da tenere sincronizzato.
export function slotState(slot: BinderSlot): "empty" | "missing" | "owned" {
  if (!slot.tcgdexCardId) return "empty";
  return slot.quantity >= 1 ? "owned" : "missing";
}

export async function fetchBinders(): Promise<BinderListItem[]> {
  const res = await fetch("/api/binders");
  if (!res.ok) {
    throw new Error("Impossibile caricare i binder");
  }
  return res.json();
}

export async function fetchBinderPage(
  binderId: string,
  page: number,
): Promise<BinderDetail> {
  const res = await fetch(`/api/binders/${binderId}?page=${page}`);
  if (!res.ok) {
    throw new Error("Impossibile caricare il binder");
  }
  return res.json();
}

async function patchSlot(
  binderId: string,
  slotId: string,
  input: { tcgdexCardId?: string | null; quantity?: number; condition?: string | null },
): Promise<BinderSlot> {
  const res = await fetch(`/api/binders/${binderId}/slots/${slotId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "Impossibile aggiornare lo slot");
  }
  return res.json();
}

export type AddCardToBinderResult = {
  slot: BinderSlot;
  pageNumber: number;
  mode: "checklist" | "empty";
};

/**
 * Inserisce una carta in un binder:
 * 1) se esiste già uno slot checklist con lo stesso tcgdexCardId → alza quantity
 * 2) altrimenti usa il primo slot vuoto trovato (pagine in ordine)
 */
export async function addCardToBinder(
  binderId: string,
  tcgdexCardId: string,
  options?: { quantity?: number; condition?: string | null },
): Promise<AddCardToBinderResult> {
  const quantity = Math.max(1, options?.quantity ?? 1);
  const condition = options?.condition ?? null;

  const first = await fetchBinderPage(binderId, 1);
  const totalPages = Math.max(first.totalPages, 1);

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const binder = pageNumber === 1 ? first : await fetchBinderPage(binderId, pageNumber);
    const match = binder.page.slots.find((slot) => slot.tcgdexCardId === tcgdexCardId);
    if (match) {
      const slot = await patchSlot(binderId, match.id, {
        quantity: Math.max(match.quantity, quantity),
        condition,
      });
      return { slot, pageNumber, mode: "checklist" };
    }
  }

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const binder = pageNumber === 1 ? first : await fetchBinderPage(binderId, pageNumber);
    const empty = binder.page.slots.find((slot) => !slot.tcgdexCardId);
    if (empty) {
      const slot = await patchSlot(binderId, empty.id, {
        tcgdexCardId,
        quantity,
        condition,
      });
      return { slot, pageNumber, mode: "empty" };
    }
  }

  throw new Error("Nessuno slot libero in questo binder");
}
