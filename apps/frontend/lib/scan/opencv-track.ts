export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

export type CvMat = {
  rows: number;
  data: Uint8Array;
  data32S: Int32Array;
  intPtr?: (row: number, col?: number) => Int32Array;
  delete: () => void;
};

export type Cv = {
  Mat: new (rows?: number, cols?: number, type?: number) => CvMat;
  MatVector: new () => {
    size: () => number;
    get: (index: number) => CvMat;
    delete: () => void;
  };
  Size: new (width: number, height: number) => unknown;
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
  CV_8UC4: number;
  onRuntimeInitialized?: () => void;
};

const MIN_AREA_RATIO = 0.03;
const MAX_AREA_RATIO = 0.92;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 0.84;

export const ANALYSIS_EDGE = 480;

export function findCardQuadsFromRgba(cv: Cv, width: number, height: number, data: Uint8ClampedArray): Quad[] {
  if (width < 2 || height < 2 || data.length < width * height * 4) return [];
  const src = new cv.Mat(height, width, cv.CV_8UC4);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const created: CvMat[] = [];
  try {
    src.data.set(data);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 1.2);
    cv.Canny(blurred, edges, 40, 120);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const frameArea = width * height;
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
    discard(src);
    discard(gray);
    discard(blurred);
    discard(edges);
    discard(hierarchy);
    discard(contours);
    for (const mat of created) discard(mat);
  }
}

function discard(mat: { delete: () => void } | undefined) {
  if (!mat) return;
  try {
    mat.delete();
  } catch {
    // OpenCV può già aver liberato il Mat.
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
