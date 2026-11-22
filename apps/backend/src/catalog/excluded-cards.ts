// Serie TCGdex escluse dall'app. 'tcgp' è "Pokémon TCG Pocket", il gioco per
// smartphone: le sue carte sono solo digitali e non vanno in un binder fisico.
export const EXCLUDED_SERIES = ['tcgp'];

// Set Pocket noti a ottobre 2026. L'elenco aggiornato arriva da TCGdex (serie
// 'tcgp'); questo serve solo se TCGdex non risponde.
export const EXCLUDED_SET_IDS_FALLBACK = [
  'P-A',
  'P-B',
  'A1',
  'A1a',
  'A2',
  'A2a',
  'A2b',
  'A3',
  'A3a',
  'A3b',
  'A4',
  'A4a',
  'B1',
  'B1a',
  'B2',
  'B2a',
];

// Gli id carta TCGdex sono "<id set>-<numero>" (es. "A1-025", "P-A-009").
// Il trattino finale evita che "A1" catturi anche le carte di "A1a".
export function isCardInSets(cardId: string, setIds: Iterable<string>): boolean {
  for (const setId of setIds) {
    if (cardId.startsWith(`${setId}-`)) return true;
  }
  return false;
}

export const EXCLUDED_CARD_MESSAGE =
  'Le carte di Pokémon TCG Pocket sono solo digitali e non si possono aggiungere.';
