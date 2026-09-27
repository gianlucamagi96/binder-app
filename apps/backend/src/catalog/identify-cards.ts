export type IdentifyCandidate = {
  id: string;
  name: string;
  localId: string;
};

export type RankedIdentifyCandidate = IdentifyCandidate & {
  score: number;
  exactNumber: boolean;
};

const EXACT_LIMIT = 8;
const FALLBACK_LIMIT = 6;

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

// "025" e "25" sono lo stesso numero; "TG015" e "TG15" anche.
// Il prefisso resta, così 15 non coincide con TG15.
export function canonicalLocalId(value: string): string | null {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = cleaned.match(/^([A-Z]*)(\d+)$/);
  if (!match) {
    return null;
  }
  const digits = String(Number(match[2]));
  if (!Number.isFinite(Number(match[2]))) {
    return null;
  }
  return `${match[1]}${digits}`;
}

export function parseCollectorNumber(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (!compact) {
    return null;
  }
  const slash = compact.match(/([A-Z]*\d+)\//);
  if (slash) {
    return canonicalLocalId(slash[1]);
  }
  return canonicalLocalId(compact);
}

export function localIdsMatch(printed: string, catalogLocalId: string): boolean {
  const left = canonicalLocalId(printed);
  const right = canonicalLocalId(catalogLocalId);
  return left !== null && left === right;
}

// TCGdex salva il localId a volte con zeri ("025") e a volte senza ("25").
export function localIdQueryVariants(parsed: string): string[] {
  const match = parsed.toUpperCase().match(/^([A-Z]*)(\d+)$/);
  if (!match) {
    return [parsed];
  }
  const prefix = match[1];
  const digits = match[2];
  return [
    ...new Set([
      `${prefix}${digits}`,
      `${prefix}${digits.padStart(2, '0')}`,
      `${prefix}${digits.padStart(3, '0')}`,
    ]),
  ];
}

export function localIdFromCardId(cardId: string): string {
  const index = cardId.lastIndexOf('-');
  return index >= 0 ? cardId.slice(index + 1) : cardId;
}

function nameScore(query: string, cardName: string): number {
  const q = normalizeName(query);
  const n = normalizeName(cardName);
  if (q.length < 2 || !n) {
    return 0;
  }
  if (n === q) {
    return 50;
  }
  if (n.startsWith(q) || q.startsWith(n)) {
    return 35;
  }
  if (n.includes(q) || q.includes(n)) {
    return 25;
  }
  const queryTokens = new Set(q.split(' ').filter((token) => token.length >= 2));
  const overlap = n.split(' ').filter((token) => queryTokens.has(token)).length;
  return overlap > 0 ? 15 * overlap : 0;
}

export function rankIdentifyCandidates(
  candidates: IdentifyCandidate[],
  input: { name: string; number: string },
): RankedIdentifyCandidate[] {
  const parsedNumber = parseCollectorNumber(input.number);
  const seen = new Set<string>();

  const ranked: RankedIdentifyCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    const exactNumber = parsedNumber
      ? localIdsMatch(parsedNumber, candidate.localId)
      : false;
    const score = (exactNumber ? 100 : 0) + nameScore(input.name, candidate.name);
    ranked.push({ ...candidate, score, exactNumber });
  }

  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked;
}

// Se il numero torna, mostriamo solo quelle carte: il nome italiano o un OCR
// sporco non deve nascondere la shortlist giusta. Senza numero esatto, restano
// i match per nome e l'utente sceglie dall'artwork.
export function pickIdentifyResults<T extends { score: number; exactNumber: boolean }>(
  ranked: T[],
): T[] {
  const exact = ranked.filter((item) => item.exactNumber);
  if (exact.length > 0) {
    return exact.slice(0, EXACT_LIMIT);
  }
  return ranked.filter((item) => item.score > 0).slice(0, FALLBACK_LIMIT);
}
