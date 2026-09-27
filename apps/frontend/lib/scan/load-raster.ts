import type { Raster } from "@/lib/scan/detect-cards";

function canvasToRaster(canvas: HTMLCanvasElement): Raster {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: image.data };
}

function drawToRaster(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): Raster {
  const edge = Math.max(sourceWidth, sourceHeight);
  const scale = edge > maxEdge ? maxEdge / edge : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }
  draw(ctx, width, height);
  return canvasToRaster(canvas);
}

export function videoFrameToRaster(video: HTMLVideoElement, maxEdge = 1800): Raster {
  return drawToRaster(
    (ctx, width, height) => {
      ctx.drawImage(video, 0, 0, width, height);
    },
    video.videoWidth,
    video.videoHeight,
    maxEdge,
  );
}

export function fileToRaster(file: Blob, maxEdge = 1800): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        resolve(
          drawToRaster(
            (ctx, width, height) => {
              ctx.drawImage(img, 0, 0, width, height);
            },
            img.naturalWidth,
            img.naturalHeight,
            maxEdge,
          ),
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Impossibile leggere la foto"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere la foto"));
    };
    img.src = url;
  });
}

export function rasterToObjectUrl(raster: Raster): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas non disponibile"));
  }
  const copy = new Uint8ClampedArray(raster.data);
  ctx.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Impossibile preparare l'anteprima"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.86,
    );
  });
}
