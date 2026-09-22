import TCGdex from '@tcgdex/sdk';

async function main() {
  const tcgdex = new TCGdex('en');
  const card = await tcgdex.fetch('cards', 'swsh3-136');
  if (!card) {
    throw new Error('Carta non trovata');
  }
  console.log(card.name); // "Furret"
}

main();