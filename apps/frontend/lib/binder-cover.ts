import type { BinderListItem } from "@/lib/binders";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Cloth and leather tones. Same fields as the grid tile: coverStyle, then cover image/logo. */
const SPINE_PALETTE = [
  "#1e4d8c",
  "#8c3d2f",
  "#1f6b4a",
  "#6b3f73",
  "#8a6232",
  "#1a3d5c",
  "#7a2e3b",
  "#2f5d62",
  "#a36b1d",
  "#3d4a2a",
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function binderCoverUrl(binder: BinderListItem): string | null {
  return binder.cover.image ?? binder.cover.logo;
}

export function binderSpineColor(binder: BinderListItem): string {
  const style = binder.coverStyle?.trim() ?? "";
  if (HEX.test(style)) return style.length === 4 ? expandHex(style) : style;
  const seed = style || binderCoverUrl(binder) || binder.id;
  return SPINE_PALETTE[hashString(seed) % SPINE_PALETTE.length];
}

function expandHex(short: string): string {
  const r = short[1];
  const g = short[2];
  const b = short[3];
  return `#${r}${r}${g}${g}${b}${b}`;
}
