"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, type TcgGame } from "@/lib/auth";
import type { Expansion } from "@/lib/catalog";
import type { BinderType } from "@/lib/binders";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { TcgGameIcon } from "@/components/TcgGameIcon";

const TYPE_OPTIONS: { value: BinderType; label: string; description: string }[] = [
  {
    value: "EXPANSION",
    label: "Espansione",
    description: "Checklist completo di una o più espansioni",
  },
  {
    value: "ARTIST",
    label: "Artista",
    description: "Checklist di tutte le carte di un illustratore",
  },
  { value: "GAME", label: "Gioco", description: "Binder libero associato a un gioco" },
  { value: "FREE", label: "Libero", description: "Nessun vincolo, riempilo come vuoi" },
];

export default function NewBinderPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<BinderType>("EXPANSION");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [tcgGameCode, setTcgGameCode] = useState("pokemon");
  const [selectedExpansions, setSelectedExpansions] = useState<string[]>([]);
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<string[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);

  const [games, setGames] = useState<TcgGame[]>([]);
  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [expansionsLoading, setExpansionsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/tcg-games`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setGames)
      .catch(() => setGames([]));

    fetch(`${API_URL}/catalog/expansions/recent?limit=50`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setExpansions)
      .catch(() => setExpansions([]))
      .finally(() => setExpansionsLoading(false));
  }, []);

  useEffect(() => {
    const query = artistQuery.trim();
    if (type !== "ARTIST" || query.length < 2) {
      setArtistResults([]);
      setArtistsLoading(false);
      return;
    }

    setArtistsLoading(true);
    const handle = window.setTimeout(() => {
      fetch(`${API_URL}/catalog/illustrators?q=${encodeURIComponent(query)}&limit=20`)
        .then((res) => (res.ok ? res.json() : []))
        .then((names: string[]) => setArtistResults(names))
        .catch(() => setArtistResults([]))
        .finally(() => setArtistsLoading(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [artistQuery, type]);

  function toggleExpansion(id: string) {
    setSelectedExpansions((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Inserisci un nome per il binder");
      return;
    }
    if (type === "EXPANSION" && selectedExpansions.length === 0) {
      setError("Seleziona almeno una espansione");
      return;
    }
    if (type === "ARTIST" && !selectedArtist) {
      setError("Seleziona un artista");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/binders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          rows,
          cols,
          ...(type === "GAME" ? { tcgGameCode } : {}),
          ...(type === "EXPANSION" ? { expansionIds: selectedExpansions } : {}),
          ...(type === "ARTIST" && selectedArtist ? { artistName: selectedArtist } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Impossibile creare il binder"),
        );
      }
      router.push(`/binders/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile creare il binder");
      setSubmitting(false);
    }
  }

  return (
    <PageContainer narrow className="gap-8">
      <PageHeader
        eyebrow="Nuovo"
        title="Crea binder"
        description="Scegli tipo, layout e contenuto iniziale."
        action={
          <Button href="/binders" variant="ghost" size="sm">
            Annulla
          </Button>
        }
      />

      <Panel elevated className="p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Input
            label="Nome"
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Scarlet & Violet — Master Set"
          />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground-secondary">Tipo</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`flex min-h-[4.5rem] flex-col gap-1 rounded-[var(--radius-md)] border bg-background p-3 text-left transition-[border-color,box-shadow,background-color] duration-150 ${
                    type === option.value
                      ? "border-accent bg-accent-soft/40 shadow-sm ring-1 ring-accent/20"
                      : "border-border hover:border-border-strong hover:bg-surface-hover"
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground">{option.label}</span>
                  <span className="text-xs leading-snug text-foreground-muted">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {type === "GAME" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground-secondary">Gioco</span>
              <div className="flex flex-col gap-2">
                {games.map((game) => {
                  const selectable = game.status === "ACTIVE";
                  return (
                    <button
                      key={game.code}
                      type="button"
                      disabled={!selectable}
                      onClick={() => setTcgGameCode(game.code)}
                      className={`flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] border bg-background p-3 text-left transition-colors duration-150 ${
                        tcgGameCode === game.code
                          ? "border-accent bg-accent-soft/40 ring-1 ring-accent/20"
                          : "border-border hover:border-border-strong"
                      } ${selectable ? "" : "cursor-not-allowed opacity-50"}`}
                    >
                      <TcgGameIcon
                        icon={game.icon}
                        name={game.name}
                        className="h-7 w-5"
                        emojiClassName="text-base leading-none"
                      />
                      <span className="text-sm font-medium text-foreground">{game.name}</span>
                      {!selectable && (
                        <span className="ml-auto text-xs text-foreground-muted">
                          Presto disponibile
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {type === "EXPANSION" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground-secondary">
                Espansioni{" "}
                <span className="font-mono text-foreground-muted">
                  ({selectedExpansions.length})
                </span>
              </span>
              {expansionsLoading && (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}
              {!expansionsLoading && (
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-background p-1.5">
                  {expansions.map((expansion) => {
                    const checked = selectedExpansions.includes(expansion.id);
                    return (
                      <label
                        key={expansion.id}
                        className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors duration-150 ${
                          checked ? "bg-accent-soft/60" : "hover:bg-surface-hover"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExpansion(expansion.id)}
                          className="size-4 accent-accent"
                        />
                        <span className="flex-1 text-sm text-foreground">{expansion.name}</span>
                        <span className="font-mono text-xs text-foreground-muted">
                          {expansion.cardCount.total}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {type === "ARTIST" && (
            <div className="flex flex-col gap-2">
              <Input
                label="Artista"
                id="artist"
                type="search"
                value={artistQuery}
                onChange={(e) => {
                  setArtistQuery(e.target.value);
                  setSelectedArtist(null);
                }}
                placeholder="Cerca un illustratore, es. Mitsuhiro Arita"
              />
              {selectedArtist && (
                <p className="text-sm text-foreground-secondary">
                  Selezionato: <span className="font-medium text-foreground">{selectedArtist}</span>
                </p>
              )}
              {artistsLoading && <Skeleton className="h-10 w-full" />}
              {!artistsLoading && artistQuery.trim().length >= 2 && (
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-background p-1.5">
                  {artistResults.length === 0 ? (
                    <p className="px-2.5 py-2 text-sm text-foreground-muted">Nessun artista trovato</p>
                  ) : (
                    artistResults.map((artist) => (
                      <button
                        key={artist}
                        type="button"
                        onClick={() => {
                          setSelectedArtist(artist);
                          setArtistQuery(artist);
                          setName((current) => current.trim() ? current : artist);
                        }}
                        className={`flex min-h-11 items-center rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm text-foreground transition-colors duration-150 ${
                          selectedArtist === artist ? "bg-accent-soft/60" : "hover:bg-surface-hover"
                        }`}
                      >
                        {artist}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Righe"
              id="rows"
              type="number"
              min={1}
              max={10}
              inputMode="numeric"
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
              className="font-mono"
            />
            <Input
              label="Colonne"
              id="cols"
              type="number"
              min={1}
              max={10}
              inputMode="numeric"
              value={cols}
              onChange={(e) => setCols(Number(e.target.value))}
              className="font-mono"
            />
          </div>

          {error && (
            <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
              {error}
            </p>
          )}

          <Button type="submit" variant="ember" disabled={submitting} className="w-full">
            {submitting ? "Creazione in corso..." : "Crea binder"}
          </Button>
        </form>
      </Panel>
    </PageContainer>
  );
}
