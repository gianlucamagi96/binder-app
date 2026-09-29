import type { ScanCandidate } from "@/lib/scan/scan-api";

export const SCAN_SEED_KEY = "binder:scan-seed";

export type ScanSeed = {
  suggestedName: string;
  cards: ScanCandidate[];
};

export function writeScanSeed(seed: ScanSeed) {
  sessionStorage.setItem(SCAN_SEED_KEY, JSON.stringify(seed));
}

export function readScanSeed(): ScanSeed | null {
  const raw = sessionStorage.getItem(SCAN_SEED_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScanSeed;
    if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearScanSeed() {
  sessionStorage.removeItem(SCAN_SEED_KEY);
}
