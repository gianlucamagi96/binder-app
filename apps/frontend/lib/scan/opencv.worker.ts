import { findCardQuadsFromRgba, type Cv, type Quad } from "./opencv-track";

const OPENCV_SRC = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";

export type TrackerRequest =
  | { type: "start" }
  | {
      type: "detect";
      width: number;
      height: number;
      buffer: ArrayBuffer;
    };

export type TrackerResponse =
  | { type: "ready" }
  | { type: "failed" }
  | { type: "quads"; quads: Quad[]; ms: number }
  | { type: "detect-error" };

type WorkerScope = {
  cv?: Cv;
  importScripts?: (url: string) => void;
  onmessage: ((event: MessageEvent<TrackerRequest>) => void) | null;
  postMessage: (message: TrackerResponse, transfer?: Transferable[]) => void;
};

const scope = globalThis as unknown as WorkerScope;

let cvReady: Cv | null = null;
let started = false;

scope.onmessage = (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === "start") {
    if (started) return;
    started = true;
    void loadOpenCv()
      .then((cv) => {
        cvReady = cv;
        scope.postMessage({ type: "ready" });
      })
      .catch(() => {
        scope.postMessage({ type: "failed" });
      });
    return;
  }
  if (message.type !== "detect") return;
  if (!cvReady) {
    scope.postMessage({ type: "detect-error" });
    return;
  }
  try {
    const bytes = new Uint8ClampedArray(message.buffer);
    const startedAt = performance.now();
    const quads = findCardQuadsFromRgba(cvReady, message.width, message.height, bytes);
    scope.postMessage({ type: "quads", quads, ms: performance.now() - startedAt });
  } catch {
    scope.postMessage({ type: "detect-error" });
  }
};

async function loadOpenCv(): Promise<Cv> {
  await installOpenCv();
  return waitUntilReady();
}

async function installOpenCv(): Promise<void> {
  if (typeof scope.importScripts !== "function") throw new Error("OpenCV non disponibile");
  scope.importScripts(OPENCV_SRC);
}

function waitUntilReady(): Promise<Cv> {
  const current = () => {
    const cv = scope.cv;
    return cv && typeof cv.Mat === "function" ? cv : null;
  };
  const existing = current();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const finish = () => {
      const cv = current();
      if (!cv) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve(cv);
    };
    timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("OpenCV non disponibile"));
    }, 20000);
    poll = setInterval(finish, 100);
    const cv = scope.cv;
    if (cv) {
      const previous = cv.onRuntimeInitialized;
      cv.onRuntimeInitialized = () => {
        previous?.();
        finish();
      };
    }
    finish();
  });
}
