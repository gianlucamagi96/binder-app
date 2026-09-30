"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { loadOpenCv, quadsInVideo, type Quad } from "@/lib/scan/opencv-track";
import { photoBlobFromFile, photoBlobFromVideo } from "@/lib/scan/prepare-photo";

type TrackerState = "loading" | "ready" | "hidden";

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
  const cvRef = useRef<Awaited<ReturnType<typeof loadOpenCv>> | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>("loading");
  const [tracked, setTracked] = useState(0);
  const [trackNote, setTrackNote] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraReady(false);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Fotocamera non disponibile. Carica una foto.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
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
        const video = videoRef.current;
        if (video) {
          video.srcObject = next;
          await video.play();
        }
        if (!cancelled) setCameraReady(true);
      })
      .catch(() => {
        if (!cancelled) setCameraError("Fotocamera non disponibile. Carica una foto.");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadOpenCv()
      .then((cv) => {
        if (cancelled) return;
        cvRef.current = cv;
        setTracker("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setTracker("hidden");
        setTrackNote("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tracker !== "ready" || !cameraReady) return;
    let stopped = false;
    let timer = 0;
    let slowFrames = 0;
    let failedFrames = 0;
    let warmed = 0;
    let interval = 120;
    const scratch = document.createElement("canvas");

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const cv = cvRef.current;
      if (video && cv && video.readyState >= 2) {
        const started = performance.now();
        try {
          const quads = quadsInVideo(cv, video, scratch);
          quadsRef.current = quads;
          failedFrames = 0;
          setTracked((current) => (current === quads.length ? current : quads.length));
        } catch {
          failedFrames += 1;
          if (failedFrames >= 3) {
            quadsRef.current = [];
            setTracked(0);
            setTracker("hidden");
            setTrackNote("Rilevamento dei bordi non disponibile. Puoi comunque scattare.");
            return;
          }
        }
        const elapsed = performance.now() - started;
        warmed += 1;
        if (warmed <= 3) {
          interval = 150;
        } else if (elapsed > 250) {
          slowFrames += 1;
          interval = 180;
          if (slowFrames >= 5) {
            quadsRef.current = [];
            setTracked(0);
            setTracker("hidden");
            setTrackNote("Il rilevamento live è troppo pesante su questo dispositivo. Puoi comunque scattare.");
            return;
          }
        } else {
          slowFrames = 0;
          interval = elapsed > 110 ? 150 : 120;
        }
      }
      timer = window.setTimeout(tick, interval);
    };

    timer = window.setTimeout(tick, 120);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      quadsRef.current = [];
    };
  }, [tracker, cameraReady]);

  useEffect(() => {
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
      if (!context) return;
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
          className={`aspect-[3/4] w-full object-contain sm:aspect-[4/3] ${cameraReady ? "block" : "hidden"}`}
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {!cameraReady && (
          <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 px-6 text-center sm:aspect-[4/3]">
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
