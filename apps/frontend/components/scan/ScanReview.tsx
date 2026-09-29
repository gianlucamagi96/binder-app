"use client";

import { useEffect, useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { searchCatalogCards } from "@/lib/catalog";
import type { BinderListItem } from "@/lib/binders";
import type { ScanBox, ScanCandidate, ScanReading } from "@/lib/scan/scan-api";

export type ReviewDetection = {
  key: string;
  box: ScanBox;
  cropUrl: string;
  reading: ScanReading;
  candidates: ScanCandidate[];
  selected: ScanCandidate | null;
  accepted: boolean;
  removed: boolean;
};

export function ScanReview({
  detections,
  binders,
  bindersLoading,
  bindersError,
  pickerOpen,
  saving,
  saveError,
  onChange,
  onOpenPicker,
  onClosePicker,
  onSaveBinder,
  onCreateBinder,
}: {
  detections: ReviewDetection[];
  binders: BinderListItem[];
  bindersLoading: boolean;
  bindersError: string | null;
  pickerOpen: boolean;
  saving: boolean;
  saveError: string | null;
  onChange: (next: ReviewDetection[]) => void;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onSaveBinder: (binderId: string) => void;
  onCreateBinder: () => void;
}) {
  const pending = detections.filter((item) => !item.removed && !item.accepted);
  const accepted = detections.filter((item) => item.accepted && !item.removed && item.selected);
  const [focusKey, setFocusKey] = useState<string | null>(pending[0]?.key ?? null);
  const [binderId, setBinderId] = useState("");
  const current = pending.find((item) => item.key === focusKey) ?? pending[0] ?? null;
  const reviewing = current !== null;

  useEffect(() => {
    if (current && current.key !== focusKey) setFocusKey(current.key);
    if (!current && focusKey) setFocusKey(null);
  }, [current, focusKey]);

  function patch(key: string, update: Partial<ReviewDetection>) {
    onChange(detections.map((item) => (item.key === key ? { ...item, ...update } : item)));
  }

  function accept(key: string) {
    patch(key, { accepted: true });
  }

  function acceptAll() {
    onChange(
      detections.map((item) =>
        !item.removed && !item.accepted && item.selected ? { ...item, accepted: true } : item,
      ),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {reviewing
            ? pending.length === 1
              ? "1 carta da rivedere"
              : `${pending.length} carte da rivedere`
            : accepted.length === 1
              ? "1 carta confermata"
              : `${accepted.length} carte confermate`}
        </p>
        {reviewing && pending.length > 1 && (
          <p className="font-mono text-xs text-foreground-muted">
            {pending.findIndex((item) => item.key === current.key) + 1}/{pending.length}
          </p>
        )}
      </div>

      {current && (
        <ReviewCard
          item={current}
          onSelect={(selected) => patch(current.key, { selected })}
          onAccept={() => accept(current.key)}
          onAcceptAll={pending.length > 1 ? acceptAll : undefined}
          onRemove={() => patch(current.key, { removed: true, accepted: false })}
        />
      )}

      {accepted.length > 0 && (
        <Panel className="flex flex-col gap-3 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Confermate</p>
          <ul className="flex flex-col gap-2">
            {accepted.map((item) => (
              <li key={item.key} className="flex items-center gap-3">
                <CardFace image={item.selected?.image ?? null} name={item.selected?.name ?? ""} className="h-14 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{item.selected?.name}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {item.selected?.set?.name ?? "Set"}
                    {item.selected?.localId ? ` · ${item.selected.localId}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Togli ${item.selected?.name ?? "carta"} dalle confermate`}
                  onClick={() => {
                    patch(item.key, { accepted: false });
                    setFocusKey(item.key);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!reviewing && accepted.length === 0 && (
        <p className="text-sm text-foreground-muted">Hai tolto tutte le carte. Scatta un’altra foto per riprovare.</p>
      )}

      {!reviewing && accepted.length > 0 && (
        <Panel className="flex flex-col gap-4 p-4 sm:p-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Dove metterle</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Un binder libero o di gioco Pokémon. Quelli di espansione compaiono se tutte le carte sono del loro set.
              I binder artista restano fuori.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ember" disabled={saving} onClick={onOpenPicker}>
              Aggiungi a un binder esistente
            </Button>
            <Button variant="secondary" disabled={saving} onClick={onCreateBinder}>
              Crea un nuovo binder
            </Button>
          </div>
          {pickerOpen && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-background p-3">
              {bindersLoading && <p className="text-sm text-foreground-muted">Cerco i binder compatibili…</p>}
              {bindersError && <p className="text-sm text-danger-foreground">{bindersError}</p>}
              {!bindersLoading && !bindersError && binders.length === 0 && (
                <p className="text-sm text-foreground-muted">
                  Nessun binder compatibile. Creane uno nuovo con queste carte.
                </p>
              )}
              {!bindersLoading && binders.length > 0 && (
                <Select label="Binder" value={binderId} onChange={(event) => setBinderId(event.target.value)}>
                  <option value="">Seleziona un binder…</option>
                  {binders.map((binder) => (
                    <option key={binder.id} value={binder.id}>
                      {binder.name} · {binderLabel(binder)}
                    </option>
                  ))}
                </Select>
              )}
              {saveError && <p className="text-sm text-danger-foreground">{saveError}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="ember" size="sm" disabled={!binderId || saving} onClick={() => onSaveBinder(binderId)}>
                  {saving ? "Inserisco…" : "Inserisci"}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClosePicker}>
                  Annulla
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function ReviewCard({
  item,
  onSelect,
  onAccept,
  onAcceptAll,
  onRemove,
}: {
  item: ReviewDetection;
  onSelect: (candidate: ScanCandidate) => void;
  onAccept: () => void;
  onAcceptAll?: () => void;
  onRemove: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ScanCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const match = item.selected;
  const alternatives = item.candidates.filter((candidate) => candidate.id !== match?.id);

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setSearchError("Scrivi almeno 2 lettere.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const page = await searchCatalogCards(q, { limit: 8 });
      const mapped = page.items.map(toCandidate);
      setResults(mapped);
      if (mapped.length === 0) setSearchError("Nessuna carta trovata.");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Ricerca fallita");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Panel elevated className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <figure className="flex min-w-0 flex-col gap-2">
          <CardFace image={item.cropUrl} name="Ritaglio della foto" className="w-full" framed />
          <figcaption className="text-center text-xs text-foreground-muted">La tua foto</figcaption>
        </figure>
        <figure className="flex min-w-0 flex-col gap-2">
          <CardFace image={match?.image ?? null} name={match?.name ?? "Nessun match"} className="w-full" framed />
          <figcaption className="text-center text-xs text-foreground-muted">Il match</figcaption>
        </figure>
      </div>

      {match ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-semibold text-foreground">{match.name}</h2>
          <div className="flex flex-wrap gap-1.5">
            {match.localId && <Badge mono>#{match.localId}</Badge>}
            <Badge>EN</Badge>
            {match.set?.name && <Badge>{match.set.name}</Badge>}
            {match.rarity && <Badge tone="ember">{match.rarity}</Badge>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground-muted">
          Nessun match nel catalogo. Cerca la carta a mano.
        </p>
      )}

      {alternatives.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Altri match</p>
          <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Altri match">
            {alternatives.map((candidate) => (
              <CandidateButton key={candidate.id} candidate={candidate} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="self-start text-sm font-medium text-accent-text underline-offset-2 hover:underline"
        onClick={() => setSearchOpen((open) => !open)}
      >
        {match ? "Non è questa" : "Cerca nel catalogo"}
      </button>

      {searchOpen && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Nome della carta"
                value={query}
                placeholder="Es. Reshiram"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
              />
            </div>
            <Button variant="secondary" disabled={searching} onClick={() => void search()}>
              <Search className="h-4 w-4" aria-hidden />
              {searching ? "Cerco…" : "Cerca"}
            </Button>
          </div>
          {searchError && <p className="text-sm text-danger-foreground">{searchError}</p>}
          {results.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Risultati catalogo">
              {results.map((candidate) => (
                <CandidateButton key={candidate.id} candidate={candidate} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ember" className="flex-1" disabled={!match} onClick={onAccept}>
          {onAcceptAll ? "Aggiungi questa" : "Aggiungi"}
        </Button>
        {onAcceptAll && (
          <Button variant="secondary" onClick={onAcceptAll}>
            Aggiungi tutte
          </Button>
        )}
        <Button variant="ghost" aria-label="Togli questo rilevamento" onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </Panel>
  );
}

function CandidateButton({
  candidate,
  onSelect,
}: {
  candidate: ScanCandidate;
  onSelect: (candidate: ScanCandidate) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onSelect(candidate)}
      className="w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-background transition-colors hover:border-border-strong"
    >
      <CardFace image={candidate.image} name={candidate.name} className="w-full" />
    </button>
  );
}

function CardFace({
  image,
  name,
  className = "",
  framed = false,
}: {
  image: string | null;
  name: string;
  className?: string;
  framed?: boolean;
}) {
  return (
    <div
      className={`flex aspect-[63/88] items-center justify-center overflow-hidden bg-black ${
        framed ? "rounded-[var(--radius-md)] border border-border" : ""
      } ${className}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} className="h-full w-full object-contain" />
      ) : (
        <span className="px-2 text-center text-[10px] text-foreground-muted">{name}</span>
      )}
    </div>
  );
}

function toCandidate(result: {
  id: string;
  name: string;
  image: string | null;
  set?: { id: string; name: string } | null;
}): ScanCandidate {
  return {
    id: result.id,
    name: result.name,
    image: result.image,
    localId: "",
    rarity: "",
    set: result.set ?? null,
    confidence: 1,
    exactNumber: false,
  };
}

function binderLabel(binder: BinderListItem) {
  if (binder.type === "FREE") return "Libero";
  if (binder.type === "GAME") return "Gioco";
  if (binder.type === "EXPANSION") return "Espansione";
  return "Artista";
}
