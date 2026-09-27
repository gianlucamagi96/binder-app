"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Plus, RotateCw, Trash2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { identifyCatalogCards, type IdentifyCard } from "@/lib/catalog";
import {
  addCardToBinder,
  fetchBinders,
  type BinderListItem,
  type BinderType,
} from "@/lib/binders";
import {
  centeredCardQuad,
  detectCardQuads,
  fullFrameQuad,
  pointInQuad,
  rotateQuad,
  scaleQuad,
  translateQuad,
  warpCard,
  type Point,
  type Quad,
  type Raster,
} from "@/lib/scan/detect-cards";
import { fileToRaster, rasterToObjectUrl, videoFrameToRaster } from "@/lib/scan/load-raster";
import { readCardText, releaseOcrWorker } from "@/lib/scan/ocr-card";

type Step = "capture" | "frame" | "reading" | "review" | "done";

type Draft = {
  id: string;
  previewUrl: string;
  name: string;
  number: string;
  candidates: IdentifyCard[];
  selectedId: string | null;
  included: boolean;
  searching: boolean;
  error: string | null;
};

type SaveResult = {
  binderId: string;
  binderName: string;
  added: number;
  failed: string[];
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageFrom(data: { message?: string | string[] } | null, fallback: string) {
  if (!data?.message) return fallback;
  return Array.isArray(data.message) ? data.message.join(", ") : data.message;
}

function singleExactId(candidates: IdentifyCard[]): string | null {
  const exact = candidates.filter((candidate) => candidate.exactNumber);
  return exact.length === 1 ? exact[0].id : null;
}

export function ScanStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);
  const dragRef = useRef<{ index: number; last: Point } | null>(null);

  const [step, setStep] = useState<Step>("capture");
  const [status, setStatus] = useState("Cerco le carte nella foto…");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [raster, setRaster] = useState<Raster | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [quads, setQuads] = useState<Quad[]>([]);
  const [selected, setSelected] = useState(-1);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [binders, setBinders] = useState<BinderListItem[]>([]);
  const [bindersError, setBindersError] = useState<string | null>(null);
  const [binderChoice, setBinderChoice] = useState<string>("new");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  function trackUrl(url: string) {
    urlsRef.current.push(url);
    return url;
  }

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      releaseOcrWorker();
    };
  }, []);

  useEffect(() => {
    if (step !== "capture") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraReady(false);
    setCameraError(null);

    navigator.mediaDevices
      ?.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(async (next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) {
          videoRef.current.srcObject = next;
          await videoRef.current.play();
        }
        if (!cancelled) setCameraReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError("Fotocamera non disponibile. Puoi caricare una foto.");
        }
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [step]);

  async function acceptRaster(next: Raster) {
    setStep("reading");
    setStatus("Cerco le carte nella foto…");
    try {
      await wait(40);
      const found = detectCardQuads(next);
      const url = trackUrl(await rasterToObjectUrl(next));
      setRaster(next);
      setPreviewUrl(url);
      setQuads(found);
      setSelected(found.length > 0 ? 0 : -1);
      setStep("frame");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Impossibile leggere la foto");
      setStep("capture");
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setCameraError("La fotocamera non è ancora pronta.");
      return;
    }
    await acceptRaster(videoFrameToRaster(video));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      await acceptRaster(await fileToRaster(file));
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Impossibile leggere la foto");
      setStep("capture");
    }
  }

  function updateSelected(next: Quad) {
    setQuads((current) => current.map((quad, index) => (index === selected ? next : quad)));
  }

  function imagePoint(event: React.PointerEvent<SVGSVGElement>): Point | null {
    if (!raster) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * raster.width,
      y: ((event.clientY - rect.top) / rect.height) * raster.height,
    };
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = imagePoint(event);
    if (!point) return;
    for (let index = quads.length - 1; index >= 0; index -= 1) {
      if (!pointInQuad(point, quads[index])) continue;
      setSelected(index);
      dragRef.current = { index, last: point };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const point = imagePoint(event);
    if (!drag || !point) return;
    const dx = point.x - drag.last.x;
    const dy = point.y - drag.last.y;
    drag.last = point;
    setQuads((current) =>
      current.map((quad, index) => (index === drag.index ? translateQuad(quad, dx, dy) : quad)),
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function recognize() {
    if (!raster || quads.length === 0) return;
    setStep("reading");
    setStatus("Preparo la lettura del testo…");
    const bindersPromise = fetchBinders()
      .then((loaded) => {
        setBindersError(null);
        return loaded;
      })
      .catch(() => {
        setBindersError("Non riesco a caricare i binder esistenti. Puoi comunque crearne uno nuovo.");
        return [] as BinderListItem[];
      });
    const nextDrafts: Draft[] = [];

    for (let index = 0; index < quads.length; index += 1) {
      setStatus(`Leggo la carta ${index + 1} di ${quads.length}…`);
      const warped = warpCard(raster, quads[index]);
      const cardPreview = trackUrl(await rasterToObjectUrl(warped));
      let name = "";
      let number = "";
      let error: string | null = null;
      try {
        const text = await readCardText(warped);
        name = text.name;
        number = text.number;
      } catch (ocrError) {
        error = ocrError instanceof Error ? ocrError.message : "Lettura non riuscita";
      }

      let candidates: IdentifyCard[] = [];
      if (name.trim().length >= 2 || number.trim()) {
        setStatus(`Cerco nel catalogo la carta ${index + 1}…`);
        try {
          candidates = await identifyCatalogCards({ name, number });
          if (candidates.length === 0 && !error) {
            error = "Nessuna carta trovata. Controlla nome e numero.";
          }
        } catch (searchError) {
          error = searchError instanceof Error ? searchError.message : "Ricerca fallita";
        }
      } else if (!error) {
        error = "Non ho letto nome né numero. Scrivili a mano e cerca di nuovo.";
      }

      nextDrafts.push({
        id: crypto.randomUUID(),
        previewUrl: cardPreview,
        name,
        number,
        candidates,
        selectedId: singleExactId(candidates),
        included: true,
        searching: false,
        error,
      });
    }

    const loaded = await bindersPromise;
    setBinders(loaded);
    setBinderChoice(loaded[0]?.id ?? "new");
    setNewName(`Scan ${new Date().toLocaleDateString("it-IT")}`);
    setDrafts(nextDrafts);
    setSaveError(null);
    setStep("review");
  }

  async function research(draft: Draft) {
    setDrafts((current) =>
      current.map((item) => (item.id === draft.id ? { ...item, searching: true, error: null } : item)),
    );
    try {
      const candidates = await identifyCatalogCards({ name: draft.name, number: draft.number });
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                candidates,
                selectedId: singleExactId(candidates),
                searching: false,
                error: candidates.length === 0 ? "Nessuna carta trovata. Controlla nome e numero." : null,
              }
            : item,
        ),
      );
    } catch (error) {
      setDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                searching: false,
                error: error instanceof Error ? error.message : "Ricerca fallita",
              }
            : item,
        ),
      );
    }
  }

  async function save() {
    const chosen = drafts.filter((draft) => draft.included && draft.selectedId);
    if (chosen.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      let targetId = binderChoice;
      let targetName = binders.find((binder) => binder.id === binderChoice)?.name ?? "Binder";
      let expandable = false;

      if (binderChoice === "new") {
        const name = newName.trim();
        if (!name) {
          setSaveError("Dai un nome al binder");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/binders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, type: "FREE" satisfies BinderType, rows: 3, cols: 3 }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(messageFrom(data, "Impossibile creare il binder"));
        }
        targetId = data.id as string;
        targetName = (data.name as string) ?? name;
        expandable = true;
      } else {
        const binder = binders.find((item) => item.id === binderChoice);
        expandable = binder?.type === "FREE" || binder?.type === "GAME";
      }

      const failed: string[] = [];
      let added = 0;
      for (const draft of chosen) {
        const matchedName = draft.candidates.find((candidate) => candidate.id === draft.selectedId)?.name;
        const label = matchedName || draft.name || "Carta";
        try {
          await addCardToBinder(targetId, draft.selectedId as string, { expandIfFull: expandable });
          added += 1;
        } catch (error) {
          failed.push(`${label}: ${error instanceof Error ? error.message : "inserimento non riuscito"}`);
        }
      }

      setResult({ binderId: targetId, binderName: targetName, added, failed });
      setStep("done");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  function retake() {
    setRaster(null);
    setPreviewUrl(null);
    setQuads([]);
    setSelected(-1);
    setDrafts([]);
    setResult(null);
    setStep("capture");
  }

  const readyToSave = drafts.some((draft) => draft.included && draft.selectedId);
  const multipleExact = (draft: Draft) => draft.candidates.filter((candidate) => candidate.exactNumber).length > 1;

  return (
    <PageContainer className="gap-8">
      <PageHeader
        eyebrow="Dal tavolo al binder"
        title="Scansione"
        description="Fotografa una o più carte su uno sfondo scuro. Leggiamo nome e numero, tu confermi la stampa e la infili in un binder."
      />

      {step === "capture" && (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-black shadow-md">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`aspect-[3/4] w-full object-contain sm:aspect-[4/3] ${cameraReady ? "block" : "hidden"}`}
            />
            {!cameraReady && (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 px-6 text-center sm:aspect-[4/3]">
                <Camera className="h-8 w-8 text-foreground-muted" aria-hidden />
                <p className="text-sm text-foreground-muted">
                  {cameraError ?? "Apro la fotocamera…"}
                </p>
              </div>
            )}
          </div>
          {cameraError && cameraReady && (
            <p className="text-sm text-danger-foreground">{cameraError}</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ember" className="flex-1" disabled={!cameraReady} onClick={captureFrame}>
              <Camera className="h-4 w-4" aria-hidden />
              Scatta
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" aria-hidden />
              Carica una foto
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile(file);
              }}
            />
          </div>
          <p className="text-sm leading-relaxed text-foreground-muted">
            Tieni le carte intere, staccate tra loro, con il nome in alto. Uno sfondo scuro aiuta a trovare i bordi.
          </p>
        </div>
      )}

      {step === "reading" && (
        <Panel elevated className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold text-foreground" role="status">
            {status}
          </p>
          <p className="text-sm text-foreground-muted">La prima lettura scarica il motore di testo, poi è più rapida.</p>
        </Panel>
      )}

      {step === "frame" && raster && previewUrl && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-black shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Foto da ritagliare" className="block w-full" />
            <svg
              className="absolute inset-0 h-full w-full touch-none"
              viewBox={`0 0 ${raster.width} ${raster.height}`}
              preserveAspectRatio="none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {quads.map((quad, index) => {
                const active = index === selected;
                return (
                  <g key={index}>
                    <polygon
                      points={quad.map((point) => `${point.x},${point.y}`).join(" ")}
                      fill={active ? "rgba(232, 163, 23, 0.18)" : "rgba(59, 130, 246, 0.16)"}
                      stroke={active ? "#e8a317" : "#7db4ff"}
                      strokeWidth={raster.width * 0.004}
                    />
                    <circle cx={quad[0].x} cy={quad[0].y} r={raster.width * 0.012} fill="#e8a317" />
                  </g>
                );
              })}
            </svg>
          </div>

          <p className="text-sm text-foreground-muted">
            {quads.length === 0
              ? "Non ho trovato carte. Aggiungi un’area o usa l’intera foto se inquadra una sola carta."
              : `${quads.length} ${quads.length === 1 ? "carta trovata" : "carte trovate"}. Il punto ambra è l’angolo in alto a sinistra: ruota se la carta è storta.`}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const quad = centeredCardQuad(raster.width, raster.height);
                setQuads((current) => [...current, quad]);
                setSelected(quads.length);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Aggiungi area
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuads([fullFrameQuad(raster.width, raster.height)]);
                setSelected(0);
              }}
            >
              Usa tutta la foto
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={selected < 0}
              onClick={() => updateSelected(rotateQuad(quads[selected]))}
            >
              <RotateCw className="h-4 w-4" aria-hidden />
              Ruota
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={selected < 0}
              onClick={() => updateSelected(scaleQuad(quads[selected], 1.08))}
            >
              Più grande
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={selected < 0}
              onClick={() => updateSelected(scaleQuad(quads[selected], 0.92))}
            >
              Più piccola
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selected < 0}
              onClick={() => {
                setQuads((current) => current.filter((_, index) => index !== selected));
                setSelected((index) => Math.min(index, quads.length - 2));
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Togli
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ember" disabled={quads.length === 0} onClick={() => void recognize()}>
              Riconosci
            </Button>
            <Button variant="ghost" onClick={retake}>
              Nuova foto
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-6">
          {drafts.map((draft, index) => (
            <Panel key={draft.id} elevated className="grid gap-4 p-4 sm:grid-cols-[9.5rem_1fr] sm:p-5">
              <div className="flex flex-col gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.previewUrl}
                  alt={`Ritaglio ${index + 1}`}
                  className="mx-auto w-36 rounded-[var(--radius-md)] border border-border bg-black sm:w-full"
                />
                <label className="flex items-center gap-2 text-sm text-foreground-secondary">
                  <input
                    type="checkbox"
                    checked={draft.included}
                    onChange={(event) =>
                      setDrafts((current) =>
                        current.map((item) =>
                          item.id === draft.id ? { ...item, included: event.target.checked } : item,
                        ),
                      )
                    }
                  />
                  Inserisci
                </label>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Nome letto"
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((current) =>
                        current.map((item) =>
                          item.id === draft.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Numero"
                    value={draft.number}
                    placeholder="025/165"
                    onChange={(event) =>
                      setDrafts((current) =>
                        current.map((item) =>
                          item.id === draft.id ? { ...item, number: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <Button size="sm" variant="secondary" disabled={draft.searching} onClick={() => void research(draft)}>
                    {draft.searching ? "Cerco…" : "Cerca di nuovo"}
                  </Button>
                </div>
                {draft.error && <p className="text-sm text-danger-foreground">{draft.error}</p>}
                {draft.included && !draft.selectedId && draft.candidates.length > 0 && (
                  <p className="text-sm text-foreground-muted">Tocca la stampa giusta per includerla.</p>
                )}
                {multipleExact(draft) && (
                  <p className="text-sm text-foreground-muted">
                    Stesso numero in più set. Scegli la stampa dall’artwork.
                  </p>
                )}
                {draft.candidates.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label={`Candidati carta ${index + 1}`}>
                    {draft.candidates.map((candidate) => {
                      const active = candidate.id === draft.selectedId;
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() =>
                            setDrafts((current) =>
                              current.map((item) =>
                                item.id === draft.id ? { ...item, selectedId: candidate.id, included: true } : item,
                              ),
                            )
                          }
                          className={`flex w-28 shrink-0 flex-col gap-1.5 rounded-[var(--radius-md)] border p-1.5 text-left transition-colors ${
                            active
                              ? "border-ember bg-ember-soft"
                              : "border-border bg-background hover:border-border-strong"
                          }`}
                        >
                          <div className="flex aspect-[5/7] items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-background">
                            {candidate.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={candidate.image} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <span className="px-1 text-center text-[10px] text-foreground-muted">{candidate.name}</span>
                            )}
                          </div>
                          <span className="truncate text-xs font-semibold text-foreground">{candidate.name}</span>
                          <span className="truncate text-[10px] text-foreground-muted">
                            {candidate.set?.name ?? "Set"} · {candidate.localId}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          ))}

          <Panel className="flex flex-col gap-4 p-4 sm:p-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">Dove metterle</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Un binder che hai già, oppure uno nuovo libero 3×3. Se si riempie, aggiungo una pagina.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setBinderChoice("new")}
                className={`rounded-[var(--radius-md)] border px-3 py-3 text-left text-sm ${
                  binderChoice === "new"
                    ? "border-ember bg-ember-soft text-foreground"
                    : "border-border text-foreground-secondary hover:border-border-strong"
                }`}
              >
                Nuovo binder
              </button>
              {binderChoice === "new" && (
                <Input
                  label="Nome"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              )}
              {binders.map((binder) => (
                <button
                  key={binder.id}
                  type="button"
                  onClick={() => setBinderChoice(binder.id)}
                  className={`rounded-[var(--radius-md)] border px-3 py-3 text-left text-sm ${
                    binderChoice === binder.id
                      ? "border-ember bg-ember-soft text-foreground"
                      : "border-border text-foreground-secondary hover:border-border-strong"
                  }`}
                >
                  <span className="font-medium text-foreground">{binder.name}</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">
                    {binder.type === "FREE"
                      ? "Libero"
                      : binder.type === "GAME"
                        ? "Gioco"
                        : binder.type === "ARTIST"
                          ? "Artista"
                          : "Espansione"}
                  </span>
                </button>
              ))}
            </div>
            {bindersError && <p className="text-sm text-danger-foreground">{bindersError}</p>}
            {saveError && <p className="text-sm text-danger-foreground">{saveError}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="ember" disabled={!readyToSave || saving} onClick={() => void save()}>
                {saving ? "Inserisco…" : "Aggiungi al binder"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("frame")}>
                Torna ai ritagli
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {step === "done" && result && (
        <Panel elevated className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-10">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {result.added === 0
              ? "Nessuna carta inserita"
              : result.added === 1
                ? `1 carta in ${result.binderName}`
                : `${result.added} carte in ${result.binderName}`}
          </h2>
          {result.failed.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-danger-foreground">
              {result.failed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button href={`/binders/${result.binderId}`} variant="ember">
              Apri binder
            </Button>
            <Button variant="secondary" onClick={retake}>
              Nuova scansione
            </Button>
          </div>
        </Panel>
      )}
    </PageContainer>
  );
}
