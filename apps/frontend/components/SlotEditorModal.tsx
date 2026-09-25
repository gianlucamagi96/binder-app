"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { API_URL } from "@/lib/auth";
import type { BinderSlot, CardSearchResult } from "@/lib/binders";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Panel } from "@/components/ui/Panel";

const CONDITION_OPTIONS = [
  { value: "", label: "Non specificata" },
  { value: "NM", label: "NM — Near Mint" },
  { value: "EX", label: "EX — Excellent" },
  { value: "GD", label: "GD — Good" },
  { value: "LP", label: "LP — Light Played" },
  { value: "PL", label: "PL — Played" },
  { value: "PO", label: "PO — Poor" },
];

type Props = {
  slot: BinderSlot;
  onClose: () => void;
  onSave: (input: {
    tcgdexCardId?: string | null;
    quantity?: number;
    condition?: string | null;
  }) => Promise<void>;
};

export function SlotEditorModal({ slot, onClose, onSave }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CardSearchResult | null>(
    slot.tcgdexCardId && slot.card
      ? { id: slot.card.id, name: slot.card.name, image: slot.card.image }
      : null,
  );
  const [quantity, setQuantity] = useState(slot.quantity || 1);
  const [condition, setCondition] = useState(slot.condition ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(() => {
      fetch(`${API_URL}/catalog/cards/search?q=${encodeURIComponent(query)}&limit=15&page=1`)
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items: CardSearchResult[] }) => {
          if (!cancelled) setResults(data.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const visibleResults = query.trim().length >= 2 ? results : [];

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ tcgdexCardId: selected.id, quantity, condition: condition || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile salvare la carta in questo slot");
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ tcgdexCardId: null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile svuotare lo slot");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-backdrop p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slot-editor-title"
    >
      <Panel
        elevated
        className="flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[var(--radius-xl)] p-5 sm:rounded-[var(--radius-xl)] sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="slot-editor-title"
            className="font-display text-lg font-semibold tracking-tight text-foreground"
          >
            Modifica slot
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {selected ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 p-3">
            {selected.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.image}
                alt={selected.name}
                className="h-20 w-14 rounded object-contain"
              />
            ) : (
              <div className="flex h-20 w-14 items-center justify-center rounded bg-surface text-xs text-foreground-muted">
                ?
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{selected.name}</span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-fit text-xs font-medium text-accent-text hover:underline"
              >
                Cambia carta
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
                aria-hidden
              />
              <Input
                type="text"
                autoFocus
                placeholder="Cerca una carta per nome..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
                aria-label="Cerca carta"
              />
            </div>
            {searching && (
              <p className="text-xs text-foreground-muted">Ricerca in corso...</p>
            )}
            {!searching && visibleResults.length > 0 && (
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-border p-1">
                {visibleResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => setSelected(result)}
                    className="flex min-h-12 items-center gap-3 rounded-[var(--radius-sm)] p-2 text-left transition-colors duration-150 hover:bg-surface-hover"
                  >
                    {result.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={result.image}
                        alt=""
                        className="h-14 w-10 rounded object-contain"
                      />
                    ) : (
                      <div className="flex h-14 w-10 items-center justify-center rounded bg-background text-xs text-foreground-muted">
                        ?
                      </div>
                    )}
                    <span className="text-sm font-medium text-foreground">{result.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!searching && query.trim().length >= 2 && visibleResults.length === 0 && (
              <p className="rounded-[var(--radius-md)] bg-surface-hover px-3 py-4 text-center text-xs text-foreground-muted">
                Nessuna carta trovata per &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>
        )}

        {selected && (
          <div className="flex gap-4">
            <Input
              label="Quantità"
              id="quantity"
              type="number"
              min={0}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full font-mono"
            />
            <Select
              label="Condizione"
              id="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {error && (
          <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          {selected && (
            <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          )}
          {slot.tcgdexCardId && (
            <Button variant="destructive" onClick={handleClear} disabled={saving}>
              Svuota slot
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
