const OPENCV_SRC = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

type CvMat = {
  rows: number;
  data32S: Int32Array;
  intPtr?: (row: number, col?: number) => Int32Array;
  delete: () => void;
};

type Cv = {
  Mat: new () => CvMat;
  MatVector: new () => {
    size: () => number;
    get: (index: number) => CvMat;
    delete: () => void;
  };
  Size: new (width: number, height: number) => unknown;
  imread: (source: HTMLCanvasElement) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  GaussianBlur: (src: CvMat, dst: CvMat, size: unknown, sigma: number) => void;
  Canny: (src: CvMat, dst: CvMat, low: number, high: number) => void;
  findContours: (src: CvMat, contours: { delete: () => void }, hierarchy: CvMat, mode: number, method: number) => void;
  arcLength: (curve: CvMat, closed: boolean) => number;
  approxPolyDP: (curve: CvMat, approx: CvMat, epsilon: number, closed: boolean) => void;
  isContourConvex: (contour: CvMat) => boolean;
  contourArea: (contour: CvMat) => number;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  onRuntimeInitialized?: () => void;
};

declare global {
  interface Window {
    cv?: Cv;
    Module?: { onRuntimeInitialized?: () => void };
  }
}

const ANALYSIS_EDGE = 480;
const MIN_AREA_RATIO = 0.03;
const MAX_AREA_RATIO = 0.92;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 0.84;

let loading: Promise<Cv> | null = null;

export function loadOpenCv(): Promise<Cv> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV è disponibile solo nel browser"));
  }
  if (window.cv?.Mat) return Promise.resolve(window.cv);
  if (loading) return loading;

  loading = new Promise<Cv>((resolve, reject) => {
    let timer = 0;
    let poll = 0;
    const stop = () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
    const succeed = () => {
      if (!window.cv?.Mat) return false;
      stop();
      resolve(window.cv);
      return true;
    };
    const fail = () => {
      stop();
      loading = null;
      reject(new Error("OpenCV non disponibile"));
    };
    timer = window.setTimeout(fail, 25000);
    window.Module = {
      onRuntimeInitialized() {
        succeed();
      },
    };
    poll = window.setInterval(() => {
      succeed();
    }, 200);
    const script = document.createElement("script");
    script.src = OPENCV_SRC;
    script.async = true;
    script.dataset.opencv = "1";
    script.addEventListener("error", () => fail(), { once: true });
    document.head.appendChild(script);
  });

  return loading;
}

export function quadsInVideo(cv: Cv, video: HTMLVideoElement, scratch: HTMLCanvasElement): Quad[] {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth === 0 || sourceHeight === 0) return [];
  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(video, 0, 0, width, height);
  const found = findCardQuads(cv, scratch);
  if (scale === 1) return found;
  const back = 1 / scale;
  return found.map((quad) => quad.map((point) => ({ x: point.x * back, y: point.y * back })) as Quad);
}

function findCardQuads(cv: Cv, source: HTMLCanvasElement): Quad[] {
  const src = cv.imread(source);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const created: CvMat[] = [];
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 1.2);
    cv.Canny(blurred, edges, 40, 120);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const frameArea = source.width * source.height;
    const quads: Quad[] = [];
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      created.push(contour);
      try {
        const perimeter = cv.arcLength(contour, true);
        if (perimeter < 40) continue;
        const approx = new cv.Mat();
        created.push(approx);
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
        if (approx.rows !== 4) continue;
        let convex = false;
        try {
          convex = cv.isContourConvex(approx);
        } catch {
          convex = false;
        }
        if (!convex) continue;
        const area = cv.contourArea(approx);
        if (area < frameArea * MIN_AREA_RATIO || area > frameArea * MAX_AREA_RATIO) continue;
        const points = pointsOf(approx);
        if (!points) continue;
        const ratio = shortOverLong(points);
        if (ratio < MIN_ASPECT || ratio > MAX_ASPECT) continue;
        const ordered = orderCorners(points);
        if (ordered) quads.push(ordered);
      } catch {
        continue;
      }
    }
    return suppressOverlaps(quads);
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
    for (const mat of created) mat.delete();
  }
}

function pointsOf(approx: CvMat): Point[] | null {
  if (approx.rows !== 4 || !approx.data32S || approx.data32S.length < 8) return null;
  const points: Point[] = [];
  for (let index = 0; index < 4; index += 1) {
    points.push({
      x: approx.data32S[index * 2],
      y: approx.data32S[index * 2 + 1],
    });
  }
  if (points.every((point) => point.x === 0 && point.y === 0)) return null;
  return points;
}

function shortOverLong(points: Point[]): number {
  const bounds = boundsOf(points);
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return long <= 0 ? 0 : short / long;
}

function orderCorners(points: Point[]): Quad | null {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  let best = Infinity;
  for (let index = 0; index < sorted.length; index += 1) {
    const score = sorted[index].x + sorted[index].y;
    if (score < best) {
      best = score;
      start = index;
    }
  }
  return [0, 1, 2, 3].map((offset) => sorted[(start + offset) % 4]) as Quad;
}

function suppressOverlaps(quads: Quad[]): Quad[] {
  const kept: Quad[] = [];
  const sorted = [...quads].sort((a, b) => quadArea(b) - quadArea(a));
  for (const quad of sorted) {
    const overlaps = kept.some((other) => iou(boundsOf(quad), boundsOf(other)) > 0.45);
    if (!overlaps) kept.push(quad);
  }
  return kept.slice(0, 8);
}

function quadArea(quad: Quad): number {
  const bounds = boundsOf(quad);
  return (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0);
}

function boundsOf(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function iou(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
) {
  const width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const height = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const intersection = width * height;
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - intersection;
  return union <= 0 ? 0 : intersection / union;
}
