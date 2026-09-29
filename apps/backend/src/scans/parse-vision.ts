export class UnexpectedVisionFormatError extends Error {
  constructor() {
    super('L\'AI ha risposto in un formato inatteso');
    this.name = 'UnexpectedVisionFormatError';
  }
}

export type VisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisionCard = {
  name: string;
  printedName: string;
  setNumber: string;
  setSymbol: string;
  box: VisionBox;
  confidence: number;
};

const MAX_CARDS = 8;

export function parseVisionPayload(raw: string): VisionCard[] {
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UnexpectedVisionFormatError();
  }

  const list = extractCardList(parsed);
  if (!list) {
    throw new UnexpectedVisionFormatError();
  }

  const cards: VisionCard[] = [];
  for (const item of list) {
    const card = normalizeCard(item);
    if (card) cards.push(card);
    if (cards.length >= MAX_CARDS) break;
  }
  return cards;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractCardList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  for (const key of ['cards', 'detections', 'items', 'results']) {
    if (Array.isArray(record[key])) return record[key];
  }
  return null;
}

function normalizeCard(item: unknown): VisionCard | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const name = textField(record, ['name', 'englishName', 'cardName']);
  const printedName = textField(record, ['printedName', 'printed', 'originalName']);
  const setNumber = textField(record, ['setNumber', 'number', 'collectorNumber', 'localId']);
  const setSymbol = textField(record, ['setSymbol', 'set', 'expansion', 'setName']);
  const box = normalizeBox(record.box ?? record.boundingBox ?? record.bbox);
  if (!box) return null;
  if (!name && !printedName && !setNumber) return null;
  return {
    name,
    printedName,
    setNumber,
    setSymbol,
    box,
    confidence: normalizeConfidence(record.confidence ?? record.score),
  };
}

function textField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizeBox(value: unknown): VisionBox | null {
  if (Array.isArray(value) && value.length >= 4) {
    return clampBox(numberAt(value[0]), numberAt(value[1]), numberAt(value[2]), numberAt(value[3]));
  }
  if (!value || typeof value !== 'object') return null;
  const box = value as Record<string, unknown>;
  if ('x2' in box || 'right' in box) {
    const x1 = numberAt(box.x ?? box.x1 ?? box.left);
    const y1 = numberAt(box.y ?? box.y1 ?? box.top);
    const x2 = numberAt(box.x2 ?? box.right);
    const y2 = numberAt(box.y2 ?? box.bottom);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return clampBox(x1, y1, x2 - x1, y2 - y1);
  }
  const x = numberAt(box.x ?? box.left);
  const y = numberAt(box.y ?? box.top);
  const width = numberAt(box.width ?? box.w);
  const height = numberAt(box.height ?? box.h);
  if (x === null || y === null || width === null || height === null) return null;
  return clampBox(x, y, width, height);
}

function clampBox(x: number | null, y: number | null, width: number | null, height: number | null): VisionBox | null {
  if (x === null || y === null || width === null || height === null) return null;
  const left = clamp(x, 0, 100);
  const top = clamp(y, 0, 100);
  const w = clamp(width, 0, 100 - left);
  const h = clamp(height, 0, 100 - top);
  if (w < 2 || h < 2) return null;
  return {
    x: round1(left),
    y: round1(top),
    width: round1(w),
    height: round1(h),
  };
}

function normalizeConfidence(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const unit = parsed > 1 ? parsed / 100 : parsed;
  return round1(clamp(unit, 0, 1));
}

function numberAt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
