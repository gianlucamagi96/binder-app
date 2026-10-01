import type { ScanBox } from "@/lib/scan/scan-api";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export type SourceRegion = { x: number; y: number; width: number; height: number };

export async function photoBlobFromVideo(video: HTMLVideoElement, region?: SourceRegion): Promise<Blob> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error("La fotocamera non è ancora pronta.");
  }
  return rasterToJpeg(video, video.videoWidth, video.videoHeight, region);
}

export async function photoBlobFromFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Impossibile leggere questa foto. Usa JPEG, PNG o WebP.");
  });
  try {
    return await rasterToJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function rasterToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  region: SourceRegion = { x: 0, y: 0, width, height },
): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(region.width, region.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile preparare la foto");
  context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) throw new Error("Impossibile preparare la foto");
  return blob;
}

export async function cropBoxUrl(photo: Blob, box: ScanBox): Promise<string> {
  const bitmap = await createImageBitmap(photo);
  try {
    const x = (box.x / 100) * bitmap.width;
    const y = (box.y / 100) * bitmap.height;
    const width = Math.max(1, (box.width / 100) * bitmap.width);
    const height = Math.max(1, (box.height / 100) * bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossibile ritagliare la carta");
    context.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Impossibile ritagliare la carta");
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}
