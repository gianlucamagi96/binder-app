"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { LiveCamera } from "@/components/scan/LiveCamera";
import { ScanReview, type ReviewDetection } from "@/components/scan/ScanReview";
import { addCardToBinder, type BinderListItem } from "@/lib/binders";
import { listCompatibleBinders } from "@/lib/scan/compatible-binders";
import { cropBoxUrl } from "@/lib/scan/prepare-photo";
import { ScanRequestError, submitScan } from "@/lib/scan/scan-api";
import { writeScanSeed } from "@/lib/scan/scan-seed";

type Step = "capture" | "analyzing" | "review" | "empty" | "done";

type SaveResult = {
  binderId: string;
  binderName: string;
  added: number;
  failed: string[];
};

export function ScanStudio() {
  const router = useRouter();
  const urlsRef = useRef<string[]>([]);

  const [step, setStep] = useState<Step>("capture");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<ReviewDetection[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [binders, setBinders] = useState<BinderListItem[]>([]);
  const [bindersLoading, setBindersLoading] = useState(false);
  const [bindersError, setBindersError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
    };
  }, []);

  async function analyze(photo: Blob) {
    setCaptureError(null);
    setFormatError(null);
    setPickerOpen(false);
    setSaveError(null);
    const url = trackUrl(URL.createObjectURL(photo));
    setPhotoUrl(url);
    setStep("analyzing");
    try {
      const scan = await submitScan(photo);
      if (scan.detections.length === 0) {
        setDetections([]);
        setStep("empty");
        return;
      }
      const next = await Promise.all(
        scan.detections.map(async (detection) => ({
          key: crypto.randomUUID(),
          box: detection.box,
          cropUrl: trackUrl(await cropBoxUrl(photo, detection.box)),
          reading: detection.reading,
          candidates: detection.candidates,
          selected: detection.candidates[0] ?? null,
          accepted: false,
          removed: false,
        })),
      );
      setDetections(next);
      setStep("review");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Identificazione non riuscita";
      if (error instanceof ScanRequestError && error.status === 422) {
        setFormatError(message);
      } else {
        setCaptureError(message);
      }
      setStep("capture");
    }
  }

  function kept() {
    return detections.filter((item) => item.accepted && !item.removed && item.selected);
  }

  async function openPicker() {
    setPickerOpen(true);
    setBindersError(null);
    setBindersLoading(true);
    try {
      const cards = kept().map((item) => ({ setId: item.selected?.set?.id ?? null }));
      setBinders(await listCompatibleBinders(cards));
    } catch {
      setBinders([]);
      setBindersError("Non riesco a caricare i binder. Puoi crearne uno nuovo.");
    } finally {
      setBindersLoading(false);
    }
  }

  function createBinder() {
    const cards = kept()
      .map((item) => item.selected)
      .filter((card): card is NonNullable<typeof card> => card !== null);
    if (cards.length === 0) return;
    writeScanSeed({
      suggestedName: `Scan ${new Date().toLocaleDateString("it-IT")}`,
      cards,
    });
    router.push("/binders/new");
  }

  async function saveBinder(binderId: string) {
    const chosen = kept();
    if (!binderId || chosen.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const binder = binders.find((item) => item.id === binderId);
    const expandable = binder?.type === "FREE" || binder?.type === "GAME";
    const failed: string[] = [];
    let added = 0;
    try {
      for (const item of chosen) {
        const card = item.selected;
        if (!card) continue;
        try {
          await addCardToBinder(binderId, card.id, { expandIfFull: expandable });
          added += 1;
        } catch (error) {
          failed.push(`${card.name}: ${error instanceof Error ? error.message : "inserimento non riuscito"}`);
        }
      }
      setResult({
        binderId,
        binderName: binder?.name ?? "Binder",
        added,
        failed,
      });
      setStep("done");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  function retake() {
    setPhotoUrl(null);
    setDetections([]);
    setResult(null);
    setFormatError(null);
    setCaptureError(null);
    setPickerOpen(false);
    setStep("capture");
  }

  return (
    <PageContainer className="gap-8">
      <PageHeader
        eyebrow="Fotocamera"
        title="Scansione"
        description="Inquadra le carte: i bordi rossi ti aiutano a centrarle. L’identificazione parte solo quando scatti."
        action={
          step !== "capture" && step !== "analyzing" ? (
            <Button variant="ghost" size="sm" onClick={retake}>
              Nuova foto
            </Button>
          ) : undefined
        }
      />

      {captureError && step === "capture" && (
        <p className="text-sm text-danger-foreground">{captureError}</p>
      )}
      {formatError && step === "capture" && (
        <EmptyState
          tone="error"
          title="Risposta inattesa"
          description={formatError}
          action={
            <Button variant="secondary" onClick={() => setFormatError(null)}>
              Riprova
            </Button>
          }
        />
      )}

      {step === "capture" && (
        <LiveCamera busy={false} onPhoto={(photo) => void analyze(photo)} onError={setCaptureError} />
      )}

      {step === "analyzing" && (
        <Panel elevated className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
          <Skeleton className="h-4 w-40" />
          <p className="font-display text-lg font-semibold text-foreground" role="status">
            Identifico le carte…
          </p>
          <p className="text-sm text-foreground-muted">Leggo arte e testo in un’unica foto. Resta su questa pagina.</p>
        </Panel>
      )}

      {step === "empty" && (
        <EmptyState
          title="Nessuna carta rilevata"
          description="Nella foto non ho trovato carte Pokémon. Avvicina una carta intera, con il nome leggibile, e riprova."
          action={
            <Button variant="ember" onClick={retake}>
              Nuova foto
            </Button>
          }
        />
      )}

      {step === "review" && photoUrl && (
        <ScanReview
          detections={detections}
          binders={binders}
          bindersLoading={bindersLoading}
          bindersError={bindersError}
          pickerOpen={pickerOpen}
          saving={saving}
          saveError={saveError}
          onChange={setDetections}
          onOpenPicker={() => void openPicker()}
          onClosePicker={() => setPickerOpen(false)}
          onSaveBinder={(binderId) => void saveBinder(binderId)}
          onCreateBinder={createBinder}
        />
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
