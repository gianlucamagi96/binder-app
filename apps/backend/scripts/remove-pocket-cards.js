// Toglie dai binder checklist (espansione e artista) le carte di Pokémon TCG
// Pocket non possedute e ricompatta le pagine. Le carte Pocket segnate come
// possedute non vengono toccate: lo script le elenca soltanto.
//
// Uso:
//   node scripts/remove-pocket-cards.js           anteprima, non modifica nulla
//   node scripts/remove-pocket-cards.js --apply   applica le modifiche
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
// Stesso elenco di riserva di src/catalog/excluded-cards.ts.
const FALLBACK_SET_IDS = [
  'P-A', 'P-B', 'A1', 'A1a', 'A2', 'A2a', 'A2b', 'A3', 'A3a', 'A3b',
  'A4', 'A4a', 'B1', 'B1a', 'B2', 'B2a',
];

async function pocketSetIds() {
  try {
    const res = await fetch('https://api.tcgdex.net/v2/en/series/tcgp');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const serie = await res.json();
    const ids = (serie.sets ?? []).map((set) => set.id);
    if (ids.length > 0) return ids;
  } catch (error) {
    console.warn(`TCGdex non raggiungibile (${error}), uso l'elenco di riserva.`);
  }
  return FALLBACK_SET_IDS;
}

const isPocket = (cardId, setIds) =>
  Boolean(cardId) && setIds.some((setId) => cardId.startsWith(`${setId}-`));

async function main() {
  const prisma = new PrismaClient();
  const setIds = await pocketSetIds();

  const binders = await prisma.binder.findMany({
    include: {
      pages: {
        orderBy: { pageNumber: 'asc' },
        include: { slots: { orderBy: { position: 'asc' } } },
      },
    },
  });

  let removedTotal = 0;
  for (const binder of binders) {
    const slots = binder.pages.flatMap((page) => page.slots);
    const owned = slots.filter((s) => isPocket(s.tcgdexCardId, setIds) && s.quantity > 0);
    for (const slot of owned) {
      console.log(`  [lasciata] "${binder.name}": ${slot.tcgdexCardId} è segnata come posseduta`);
    }

    if (binder.type !== 'EXPANSION' && binder.type !== 'ARTIST') continue;
    const removed = slots.filter((s) => isPocket(s.tcgdexCardId, setIds) && s.quantity === 0);
    if (removed.length === 0) continue;

    const removedIds = new Set(removed.map((s) => s.id));
    const kept = slots.filter((s) => !removedIds.has(s.id));
    const perPage = binder.rows * binder.cols;
    const pagesNeeded = Math.max(1, Math.ceil(kept.length / perPage));
    removedTotal += removed.length;
    console.log(
      `"${binder.name}" (${binder.type}): tolgo ${removed.length} carte Pocket, ` +
        `pagine ${binder.pages.length} → ${pagesNeeded}`,
    );
    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      await tx.binderSlot.deleteMany({ where: { id: { in: [...removedIds] } } });
      // Prima posizioni negative per non urtare il vincolo unico (pagina, posizione).
      for (const [index, slot] of kept.entries()) {
        await tx.binderSlot.update({ where: { id: slot.id }, data: { position: -1 - index } });
      }
      for (const [index, slot] of kept.entries()) {
        const page = binder.pages[Math.floor(index / perPage)];
        await tx.binderSlot.update({
          where: { id: slot.id },
          data: { pageId: page.id, position: index % perPage },
        });
      }
      const extraPages = binder.pages.slice(pagesNeeded).map((page) => page.id);
      if (extraPages.length > 0) {
        await tx.binderPage.deleteMany({ where: { id: { in: extraPages } } });
      }
    });
  }

  console.log(
    APPLY
      ? `Fatto: ${removedTotal} carte Pocket tolte.`
      : `Anteprima: ${removedTotal} carte Pocket da togliere. Rilancia con --apply per applicare.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
