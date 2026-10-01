"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ANALYSIS_EDGE, type Quad } from "@/lib/scan/opencv-track";
import type { TrackerResponse } from "@/lib/scan/opencv.worker";
import { photoBlobFromFile, photoBlobFromVideo } from "@/lib/scan/prepare-photo";

type TrackerState = "loading" | "ready" | "hidden";

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
  onPhoto,
  onError,
}: {
  busy: boolean;
  onPhoto: (photo: Blob) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const quadsRef = useRef<Quad[]>([]);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>("loading");
  const [tracked, setTracked] = useState(0);
  const [trackNote, setTrackNote] = useState<string | null>(null);

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
        setCameraReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCameraError(cameraErrorMessage(error));
      });

    return () => {
      cancelled = true;
      controller.abort();
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
        context.strokeStyle = "#f87171";
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

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-black shadow-md">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[3/4] w-full bg-black object-contain sm:aspect-[4/3]"
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {!cameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
            <Camera className="h-8 w-8 text-foreground-muted" aria-hidden />
            <p className="text-sm text-foreground-muted">{cameraError ?? "Apro la fotocamera…"}</p>
          </div>
        )}
        {cameraReady && tracker === "ready" && (
          <div className="absolute left-3 top-3">
            <Badge tone="warning" mono>
              {tracked === 0 ? "Nessun bordo" : tracked === 1 ? "1 carta" : `${tracked} carte`}
            </Badge>
          </div>
        )}
        {cameraReady && tracker === "loading" && (
          <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-center text-xs text-white">
            Carico il rilevamento dei bordi…
          </div>
        )}
      </div>

      {trackNote && <p className="text-sm text-foreground-muted">{trackNote}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="ember" className="flex-1" disabled={!cameraReady || busy} onClick={() => void capture()}>
          <Camera className="h-4 w-4" aria-hidden />
          Scatta
        </Button>
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" aria-hidden />
          Carica una foto
        </Button>
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
      <p className="text-sm leading-relaxed text-foreground-muted">
        I rettangoli rossi seguono i bordi e servono solo a inquadrare. La carta viene identificata quando scatti.
      </p>
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
  const scale = Math.min(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  return {
    x: (video.clientWidth - width) / 2,
    y: (video.clientHeight - height) / 2,
    width,
    height,
  };
}
