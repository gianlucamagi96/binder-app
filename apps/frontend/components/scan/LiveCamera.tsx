"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Camera, CircleHelp, Image as ImageIcon, X, Zap, ZapOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ANALYSIS_EDGE, type Quad } from "@/lib/scan/opencv-track";
import type { TrackerResponse } from "@/lib/scan/opencv.worker";
import { photoBlobFromFile, photoBlobFromVideo } from "@/lib/scan/prepare-photo";

type TrackerState = "loading" | "ready" | "hidden";

type ZoomRange = { min: number; max: number; step: number };

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

let cameraTail: Promise<void> = Promise.resolve();

export function LiveCamera({
  busy,
  notice,
  onPhoto,
  onError,
  onDismissNotice,
  onClose,
}: {
  busy: boolean;
  notice: string | null;
  onPhoto: (photo: Blob) => void;
  onError: (message: string) => void;
  onDismissNotice: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const quadsRef = useRef<Quad[]>([]);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>("loading");
  const [tracked, setTracked] = useState(0);
  const [trackNote, setTrackNote] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const controller = new AbortController();
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCameraReady(false);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Fotocamera non disponibile. Carica una foto.");
      return;
    }

    void acquireCamera(controller.signal)
      .then(async (next) => {
        stream = next;
        if (cancelled || !video) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        try {
          await showPreview(video, next, controller.signal);
        } catch (error) {
          next.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
          throw error;
        }
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = next.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const capabilities = (track?.getCapabilities?.() ?? {}) as ExtendedCapabilities;
        setTorchSupported(capabilities.torch === true);
        if (capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min) {
          const settings = track?.getSettings() as (MediaTrackSettings & { zoom?: number }) | undefined;
          setZoomRange({
            min: capabilities.zoom.min,
            max: capabilities.zoom.max,
            step: capabilities.zoom.step || 0.1,
          });
          setZoom(settings?.zoom ?? capabilities.zoom.min);
        }
        setCameraReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCameraError(cameraErrorMessage(error));
      });

    return () => {
      cancelled = true;
      controller.abort();
      trackRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraReady) return;
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;
    let busyFrame = false;
    let slowFrames = 0;
    let failedFrames = 0;
    let warmed = 0;
    let interval = 140;
    let timer = 0;
    let readyTimer = 0;
    let pendingBack = 1;
    const scratch = document.createElement("canvas");
    let worker: Worker;

    const disable = (note: string) => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(readyTimer);
      quadsRef.current = [];
      setTracked(0);
      setTracker("hidden");
      setTrackNote(note);
      worker.terminate();
    };

    try {
      worker = new Worker(new URL("../../lib/scan/opencv.worker.ts", import.meta.url));
    } catch {
      setTracker("hidden");
      setTrackNote("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
      return;
    }

    readyTimer = window.setTimeout(() => {
      disable("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
    }, 35000);

    const tick = () => {
      if (stopped || busyFrame) return;
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        timer = window.setTimeout(tick, interval);
        return;
      }
      const scale = Math.min(1, ANALYSIS_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      if (scratch.width !== width) scratch.width = width;
      if (scratch.height !== height) scratch.height = height;
      const context = scratch.getContext("2d", { willReadFrequently: true });
      if (!context) {
        timer = window.setTimeout(tick, interval);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      busyFrame = true;
      pendingBack = scale === 1 ? 1 : 1 / scale;
      try {
        worker.postMessage({ type: "detect", width, height, buffer: pixels.data.buffer }, [pixels.data.buffer]);
      } catch {
        busyFrame = false;
        failedFrames += 1;
        if (failedFrames >= 3) {
          disable("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
          return;
        }
        timer = window.setTimeout(tick, interval);
      }
    };

    worker.onmessage = (event: MessageEvent<TrackerResponse>) => {
      if (stopped) return;
      const message = event.data;
      if (message.type === "ready") {
        window.clearTimeout(readyTimer);
        setTrackNote(null);
        setTracker("ready");
        timer = window.setTimeout(tick, 120);
        return;
      }
      if (message.type === "failed") {
        disable("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
        return;
      }
      if (message.type === "detect-error") {
        busyFrame = false;
        failedFrames += 1;
        if (failedFrames >= 3) {
          disable("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
          return;
        }
        timer = window.setTimeout(tick, interval);
        return;
      }
      busyFrame = false;
      failedFrames = 0;
      quadsRef.current = scaleQuads(message.quads, pendingBack);
      setTracked((current) => (current === message.quads.length ? current : message.quads.length));
      warmed += 1;
      if (warmed > 3 && message.ms > 250) {
        slowFrames += 1;
        interval = 220;
        if (slowFrames >= 5) {
          disable("Il rilevamento live è troppo pesante su questo dispositivo. Puoi comunque scattare.");
          return;
        }
      } else if (warmed > 3) {
        slowFrames = 0;
        interval = message.ms > 110 ? 180 : 140;
      }
      timer = window.setTimeout(tick, interval);
    };

    worker.onerror = (event) => {
      event.preventDefault();
      disable("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
    };

    worker.postMessage({ type: "start" });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(readyTimer);
      worker.terminate();
      quadsRef.current = [];
    };
  }, [cameraReady]);

  useEffect(() => {
    if (!cameraReady) return;
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let frame = 0;
    let phase = 0;

    const draw = () => {
      phase += 0.7;
      const dpr = window.devicePixelRatio || 1;
      const width = video.clientWidth;
      const height = video.clientHeight;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      const quads = tracker === "ready" ? quadsRef.current : [];
      if (quads.length > 0 && video.videoWidth > 0) {
        const fitted = fittedVideoRect(video);
        context.strokeStyle = "#7db4ff";
        context.lineWidth = 3 * dpr;
        context.setLineDash([14 * dpr, 9 * dpr]);
        context.lineDashOffset = -phase * dpr;
        for (const quad of quads) {
          const xs = quad.map((point) => (fitted.x + (point.x / video.videoWidth) * fitted.width) * dpr);
          const ys = quad.map((point) => (fitted.y + (point.y / video.videoHeight) * fitted.height) * dpr);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          context.strokeRect(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
        }
      }
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [tracker, cameraReady]);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    try {
      onPhoto(await photoBlobFromVideo(video));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Impossibile scattare");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      onPhoto(await photoBlobFromFile(file));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Impossibile leggere la foto");
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  function applyZoom(value: number) {
    const track = trackRef.current;
    if (!track || !zoomRange) return;
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
    const stepped = Math.round(clamped / zoomRange.step) * zoomRange.step;
    setZoom(stepped);
    void track.applyConstraints({ advanced: [{ zoom: stepped } as MediaTrackConstraintSet] }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full bg-black object-cover"
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {!cameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-8 text-center">
            <Camera className="h-8 w-8 text-foreground-muted" aria-hidden />
            <p className="text-sm text-foreground-muted">{cameraError ?? "Apro la fotocamera…"}</p>
          </div>
        )}

        {cameraReady && <Viewfinder />}

        <div
          className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-3 pb-8"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <OverlayButton label="Chiudi la fotocamera" onClick={onClose}>
            <X className="h-6 w-6" strokeWidth={2} aria-hidden />
          </OverlayButton>
          <div className="flex items-center gap-1">
            <OverlayButton label="Come scansionare" active={helpOpen} onClick={() => setHelpOpen((open) => !open)}>
              <CircleHelp className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </OverlayButton>
            {torchSupported && (
              <OverlayButton
                label={torchOn ? "Spegni la torcia" : "Accendi la torcia"}
                active={torchOn}
                onClick={() => void toggleTorch()}
              >
                {torchOn ? (
                  <Zap className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                ) : (
                  <ZapOff className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                )}
              </OverlayButton>
            )}
          </div>
        </div>

        <div
          className="absolute inset-x-0 flex flex-col items-center gap-2 px-4"
          style={{ top: "calc(env(safe-area-inset-top) + 4.25rem)" }}
        >
          {cameraReady && tracker === "ready" && !helpOpen && !notice && (
            <Badge tone="accent" mono>
              {tracked === 0 ? "Nessun bordo" : tracked === 1 ? "1 carta" : `${tracked} carte`}
            </Badge>
          )}
          {helpOpen && (
            <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface/95 p-4 text-sm leading-relaxed text-foreground-secondary shadow-lg backdrop-blur-xl">
              <p className="font-display text-base font-semibold text-foreground">Come scansionare</p>
              <p className="mt-1">
                Inquadra una o più carte nel mirino, con il nome leggibile. I bordi blu seguono le carte e servono solo
                a centrarle: l’identificazione parte quando scatti.
              </p>
            </div>
          )}
          {notice && (
            <div
              role="alert"
              className="flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-surface/95 p-3 text-sm text-danger-foreground shadow-lg backdrop-blur-xl"
            >
              <p className="flex-1">{notice}</p>
              <button
                type="button"
                onClick={onDismissNotice}
                aria-label="Chiudi avviso"
                className="-m-1 rounded-[var(--radius-sm)] p-1 text-foreground-muted transition-colors duration-150 hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </div>

        {cameraReady && zoomRange && <ZoomSlider range={zoomRange} value={zoom} onChange={applyZoom} />}

        {cameraReady && (tracker === "loading" || trackNote) && (
          <p className="absolute inset-x-0 bottom-4 px-16 text-center text-xs text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
            {trackNote ?? "Carico il rilevamento dei bordi…"}
          </p>
        )}
      </div>

      <div
        className="grid shrink-0 grid-cols-3 items-center border-t border-border bg-surface px-6 pt-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Carica una foto"
          className="flex h-12 w-12 items-center justify-center justify-self-start rounded-[var(--radius-md)] text-foreground-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        >
          <ImageIcon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={!cameraReady || busy}
          aria-label="Scatta"
          className="group flex h-[4.75rem] w-[4.75rem] items-center justify-center justify-self-center rounded-full border-[3px] border-accent p-1 shadow-[0_0_28px_rgba(59,130,246,0.35)] transition-[opacity,transform,box-shadow] duration-150 active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          <span className="h-full w-full rounded-full bg-accent transition-colors duration-150 group-hover:bg-accent-hover" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
      </div>
    </div>
  );
}

function OverlayButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.5))] ${
        active ? "bg-white/20 text-white" : "text-white/90 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Viewfinder() {
  const corner = "absolute h-12 w-12 border-white/90 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]";
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-12 pb-10 pt-28">
      <div className="relative aspect-[63/88] max-h-full w-full max-w-[22rem]">
        <span className={`${corner} left-0 top-0 rounded-tl-[1.75rem] border-l-[5px] border-t-[5px]`} />
        <span className={`${corner} right-0 top-0 rounded-tr-[1.75rem] border-r-[5px] border-t-[5px]`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-[1.75rem] border-b-[5px] border-l-[5px]`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-[1.75rem] border-b-[5px] border-r-[5px]`} />
      </div>
    </div>
  );
}

function ZoomSlider({
  range,
  value,
  onChange,
}: {
  range: ZoomRange;
  value: number;
  onChange: (value: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const ratio = (value - range.min) / (range.max - range.min);

  function fromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = 1 - (event.clientY - rect.top) / rect.height;
    onChange(range.min + Math.min(1, Math.max(0, position)) * (range.max - range.min));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = (range.max - range.min) / 10;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      onChange(value + delta);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(value - delta);
    }
  }

  return (
    <div className="absolute bottom-12 right-2 flex flex-col items-center gap-2">
      <span className="font-mono text-[11px] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
        {value.toFixed(1)}×
      </span>
      <div
        ref={railRef}
        role="slider"
        tabIndex={0}
        aria-label="Zoom"
        aria-orientation="vertical"
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={Number(value.toFixed(1))}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
        }}
        className="relative h-36 w-10 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="absolute inset-y-3 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-white/90 shadow-sm" />
        <span
          className="absolute left-1/2 h-6 w-6 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-md"
          style={{ bottom: `calc(0.75rem + ${ratio} * (100% - 1.5rem))` }}
        />
      </div>
    </div>
  );
}

function acquireCamera(signal: AbortSignal): Promise<MediaStream> {
  const previous = cameraTail;
  let release = () => {};
  cameraTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  return previous.catch(() => undefined).then(() => openStream(signal).finally(release));
}

function openStream(signal: AbortSignal): Promise<MediaStream> {
  if (signal.aborted) return Promise.reject(new DOMException("Richiesta fotocamera annullata", "AbortError"));

  const pending = navigator.mediaDevices.getUserMedia({
    ...CAMERA_CONSTRAINTS,
    signal,
  } as MediaStreamConstraints);
  pending.then(
    (stream) => {
      if (signal.aborted) stream.getTracks().forEach((track) => track.stop());
    },
    () => undefined,
  );

  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Richiesta fotocamera annullata", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Richiesta fotocamera annullata", "AbortError")),
      { once: true },
    );
  });

  return Promise.race([pending, aborted]);
}

function showPreview(video: HTMLVideoElement, stream: MediaStream, signal: AbortSignal): Promise<void> {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.srcObject = stream;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error instanceof Error ? error : new Error("timeout"));
      else resolve();
    };
    const onAbort = () => finish(new DOMException("Richiesta fotocamera annullata", "AbortError"));
    const ready = () => {
      if (video.videoWidth > 0) finish();
    };
    timer = window.setTimeout(() => finish(new Error("timeout")), 8000);
    signal.addEventListener("abort", onAbort, { once: true });
    video.addEventListener("loadedmetadata", ready, { once: true });
    if (video.videoWidth > 0) ready();
    video.play().then(ready, (error: unknown) => finish(error));
  });
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Permesso della fotocamera negato. Puoi caricare una foto.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "Nessuna fotocamera trovata. Puoi caricare una foto.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "La fotocamera è già in uso. Chiudila nelle altre app, oppure carica una foto.";
    }
  }
  if (error instanceof Error && error.message === "timeout") {
    return "La fotocamera non risponde. Puoi caricare una foto.";
  }
  return "Fotocamera non disponibile. Carica una foto.";
}

function scaleQuads(quads: Quad[], back: number): Quad[] {
  if (back === 1) return quads;
  return quads.map((quad) => quad.map((point) => ({ x: point.x * back, y: point.y * back })) as Quad);
}

function fittedVideoRect(video: HTMLVideoElement) {
  const scale = Math.max(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  return {
    x: (video.clientWidth - width) / 2,
    y: (video.clientHeight - height) / 2,
    width,
    height,
  };
}
