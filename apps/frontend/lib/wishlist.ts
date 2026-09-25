import type { FeaturedCard } from "@/lib/catalog";

export type WishlistSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  coverImages: string[];
};

export type WishlistItem = {
  id: string;
  wishlistId: string;
  tcgdexCardId: string;
  note: string | null;
  createdAt: string;
  card: FeaturedCard | null;
};

export type WishlistDetail = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: WishlistItem[];
};

export type BulkWishlistResult = {
  added: number;
  total: number;
};

export async function fetchWishlists(): Promise<WishlistSummary[]> {
  const res = await fetch("/api/wishlists");
  if (!res.ok) throw new Error("Impossibile caricare le wishlist");
  return res.json();
}

export async function createWishlist(name: string): Promise<WishlistSummary> {
  const res = await fetch("/api/wishlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "Impossibile creare la wishlist");
  }
  return res.json();
}

export async function fetchWishlist(id: string): Promise<WishlistDetail> {
  const res = await fetch(`/api/wishlists/${id}`);
  if (!res.ok) throw new Error("Wishlist non trovata");
  return res.json();
}

export async function renameWishlist(id: string, name: string): Promise<void> {
  const res = await fetch(`/api/wishlists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Impossibile rinominare la wishlist");
}

export async function deleteWishlist(id: string): Promise<void> {
  const res = await fetch(`/api/wishlists/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Impossibile eliminare la wishlist");
}

export async function addToWishlist(input: {
  wishlistId: string;
  tcgdexCardId: string;
  note?: string;
}): Promise<WishlistItem> {
  const res = await fetch(`/api/wishlists/${input.wishlistId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tcgdexCardId: input.tcgdexCardId,
      note: input.note,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "Impossibile aggiungere alla wishlist");
  }
  return res.json();
}

export async function removeFromWishlist(
  wishlistId: string,
  itemId: string,
): Promise<void> {
  const res = await fetch(`/api/wishlists/${wishlistId}/items/${itemId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Impossibile rimuovere dalla wishlist");
}

export async function bulkWishlistFromBinder(
  wishlistId: string,
  binderId: string,
): Promise<BulkWishlistResult> {
  const res = await fetch(
    `/api/wishlists/${wishlistId}/bulk-from-binder/${binderId}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "Impossibile aggiungere le mancanti");
  }
  return res.json();
}

/** Prima wishlist dell'utente, oppure ne crea una di default. */
export async function ensureDefaultWishlistId(): Promise<string> {
  const list = await fetchWishlists();
  if (list.length > 0) return list[0].id;
  const created = await createWishlist("Wishlist");
  return created.id;
}
