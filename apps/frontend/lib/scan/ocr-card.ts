import {
  cropRaster,
  scaleRaster,
  stretchContrast,
  type Raster,
} from "@/lib/scan/detect-cards";

const NAME_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '-.";
const NUMBER_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/";

type OcrWorker = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<OcrWorker> | null = null;

async function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then((mod) => {
        const tesseract = mod as {
          createWorker?: (langs?: string) => Promise<OcrWorker>;
          default?: { createWorker?: (langs?: string) => Promise<OcrWorker> };
        };
        const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
        if (!createWorker) {
          throw new Error("Motore di lettura non disponibile");
        }
        return createWorker("eng");
      })
      .catch((error: unknown) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

export function cleanOcrName(raw: string): string {
  return raw
    .replace(/[^A-Za-zÀ-ÿ' .\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanOcrNumber(raw: string): string {
  const upper = raw.toUpperCase();
  const slash = upper.match(/[A-Z]{0,4}\s*\d{1,4}\s*\/\s*[A-Z]{0,4}\s*\d{1,4}/);
  if (slash) return slash[0].replace(/\s+/g, "");
  const token = upper.match(/[A-Z]{0,4}\s*\d{1,4}/);
  return token ? token[0].replace(/\s+/g, "") : "";
}

function rasterToCanvas(raster: Raster): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }
  const copy = new Uint8ClampedArray(raster.data);
  ctx.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0);
  return canvas;
}

function lineStrip(card: Raster, yRatio: number, heightRatio: number, xRatio: number, widthRatio: number): HTMLCanvasElement {
  const strip = stretchContrast(
    scaleRaster(
      cropRaster(
        card,
        card.width * xRatio,
        card.height * yRatio,
        card.width * widthRatio,
        card.height * heightRatio,
      ),
      2,
    ),
  );
  return rasterToCanvas(strip);
}

async function readLine(canvas: HTMLCanvasElement, whitelist: string): Promise<string> {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: "7",
    tessedit_char_whitelist: whitelist,
  });
  const result = await worker.recognize(canvas);
  return result.data.text ?? "";
}

let ocrQueue: Promise<unknown> = Promise.resolve();

function enqueueOcr<T>(job: () => Promise<T>): Promise<T> {
  const run = ocrQueue.then(job, job);
  ocrQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readCardText(card: Raster): Promise<{ name: string; number: string }> {
  const nameCanvas = lineStrip(card, 0.025, 0.09, 0.05, 0.68);
  const numberCanvas = lineStrip(card, 0.9, 0.075, 0.03, 0.5);
  return enqueueOcr(async () => {
    const name = await readLine(nameCanvas, NAME_WHITELIST);
    const number = await readLine(numberCanvas, NUMBER_WHITELIST);
    return {
      name: cleanOcrName(name),
      number: cleanOcrNumber(number),
    };
  });
}

export function releaseOcrWorker() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  pending.then((worker) => worker.terminate()).catch(() => undefined);
}
