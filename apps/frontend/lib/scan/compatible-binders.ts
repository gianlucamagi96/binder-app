import { fetchBinderPage, fetchBinders, type BinderListItem } from "@/lib/binders";

export async function listCompatibleBinders(
  cards: { setId: string | null }[],
): Promise<BinderListItem[]> {
  const binders = await fetchBinders();
  const loose = binders.filter((binder) => {
    if (binder.type === "FREE") return true;
    if (binder.type === "GAME") {
      return binder.tcgGameCode === "pokemon" || binder.tcgGameCode === null;
    }
    return false;
  });

  const setIds = cards.map((card) => card.setId).filter((id): id is string => Boolean(id));
  if (setIds.length === 0 || setIds.length !== cards.length) return loose;

  const expansionBinders = await Promise.all(
    binders
      .filter((binder) => binder.type === "EXPANSION")
      .map(async (binder) => {
        try {
          const detail = await fetchBinderPage(binder.id, 1);
          return setIds.every((id) => detail.expansionIds.includes(id)) ? binder : null;
        } catch {
          return null;
        }
      }),
  );

  return [...loose, ...expansionBinders.filter((binder): binder is BinderListItem => binder !== null)];
}
