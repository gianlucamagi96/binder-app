export type Raster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type Point = { x: number; y: number };

/** Angoli in ordine: alto-sinistra, alto-destra, basso-destra, basso-sinistra. */
export type Quad = [Point, Point, Point, Point];

const CARD_SHORT = 63;
const CARD_LONG = 88;
export const CARD_ASPECT = CARD_SHORT / CARD_LONG;

const WARP_WIDTH = 420;
const WARP_HEIGHT = Math.round(WARP_WIDTH / CARD_ASPECT);

const DETECT_MAX_EDGE = 720;

export function centeredCardQuad(width: number, height: number, heightRatio = 0.46): Quad {
  const cardH = height * heightRatio;
  const cardW = cardH * CARD_ASPECT;
  const x = (width - cardW) / 2;
  const y = (height - cardH) / 2;
  return [
    { x, y },
    { x: x + cardW, y },
    { x: x + cardW, y: y + cardH },
    { x, y: y + cardH },
  ];
}

export function fullFrameQuad(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
}

export function translateQuad(quad: Quad, dx: number, dy: number): Quad {
  return quad.map((point) => ({ x: point.x + dx, y: point.y + dy })) as Quad;
}

export function scaleQuad(quad: Quad, factor: number): Quad {
  const cx = quad.reduce((sum, point) => sum + point.x, 0) / 4;
  const cy = quad.reduce((sum, point) => sum + point.y, 0) / 4;
  return quad.map((point) => ({
    x: cx + (point.x - cx) * factor,
    y: cy + (point.y - cy) * factor,
  })) as Quad;
}

export function rotateQuad(quad: Quad): Quad {
  return [quad[1], quad[2], quad[3], quad[0]];
}

export function pointInQuad(point: Point, quad: Quad): boolean {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i, i += 1) {
    const a = quad[i];
    const b = quad[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function detectCardQuads(source: Raster): Quad[] {
  const fitted = fitDetectRaster(source);
  const colorQuads = quadsFromMask(foregroundMask(fitted.raster), fitted.raster.width, fitted.raster.height);
  const edgeQuads = quadsFromMask(interiorFromEdges(fitted.raster), fitted.raster.width, fitted.raster.height);
  const merged = suppressOverlaps([...colorQuads, ...edgeQuads]);
  return merged.map((quad) => scaleQuadPoints(quad, fitted.scale));
}

export function warpCard(source: Raster, quad: Quad): Raster {
  const dest: Raster = {
    width: WARP_WIDTH,
    height: WARP_HEIGHT,
    data: new Uint8ClampedArray(WARP_WIDTH * WARP_HEIGHT * 4),
  };
  const homography = destToSourceHomography(quad, WARP_WIDTH, WARP_HEIGHT);
  if (!homography) {
    return dest;
  }

  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = homography;
  for (let y = 0; y < WARP_HEIGHT; y += 1) {
    for (let x = 0; x < WARP_WIDTH; x += 1) {
      const denom = h31 * x + h32 * y + h33;
      if (Math.abs(denom) < 1e-8) continue;
      const sx = (h11 * x + h12 * y + h13) / denom;
      const sy = (h21 * x + h22 * y + h23) / denom;
      const pixel = sampleBilinear(source, sx, sy);
      const offset = (y * WARP_WIDTH + x) * 4;
      dest.data[offset] = pixel[0];
      dest.data[offset + 1] = pixel[1];
      dest.data[offset + 2] = pixel[2];
      dest.data[offset + 3] = pixel[3];
    }
  }
  return dest;
}

export function cropRaster(source: Raster, x: number, y: number, width: number, height: number): Raster {
  const x0 = clamp(Math.round(x), 0, Math.max(0, source.width - 1));
  const y0 = clamp(Math.round(y), 0, Math.max(0, source.height - 1));
  const w = clamp(Math.round(width), 1, source.width - x0);
  const h = clamp(Math.round(height), 1, source.height - y0);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const src = ((y0 + row) * source.width + x0) * 4;
    data.set(source.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

export function scaleRaster(source: Raster, factor: number): Raster {
  const width = Math.max(1, Math.round(source.width * factor));
  const height = Math.max(1, Math.round(source.height * factor));
  return resizeRaster(source, width, height);
}

export function stretchContrast(source: Raster): Raster {
  let min = 255;
  let max = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    const lum = source.data[i] * 0.299 + source.data[i + 1] * 0.587 + source.data[i + 2] * 0.114;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const span = Math.max(1, max - min);
  const data = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < source.data.length; i += 4) {
    const lum = source.data[i] * 0.299 + source.data[i + 1] * 0.587 + source.data[i + 2] * 0.114;
    const value = ((lum - min) / span) * 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { width: source.width, height: source.height, data };
}

function fitDetectRaster(source: Raster): { raster: Raster; scale: number } {
  const edge = Math.max(source.width, source.height);
  if (edge <= DETECT_MAX_EDGE) {
    return { raster: source, scale: 1 };
  }
  const scale = edge / DETECT_MAX_EDGE;
  const width = Math.max(1, Math.round(source.width / scale));
  const height = Math.max(1, Math.round(source.height / scale));
  return { raster: resizeRaster(source, width, height), scale };
}

function scaleQuadPoints(quad: Quad, scale: number): Quad {
  return quad.map((point) => ({ x: point.x * scale, y: point.y * scale })) as Quad;
}

function foregroundMask(raster: Raster): Uint8Array | null {
  const width = raster.width;
  const height = raster.height;
  const patch = Math.max(4, Math.round(Math.min(width, height) * 0.04));
  const corners = [
    medianColor(raster, 0, 0, patch, patch),
    medianColor(raster, width - patch, 0, patch, patch),
    medianColor(raster, 0, height - patch, patch, patch),
    medianColor(raster, width - patch, height - patch, patch, patch),
  ];
  const bg = averageColor(corners);
  const spread = Math.max(...corners.map((color) => colorDistance(color, bg)));
  if (spread > 48) {
    return null;
  }

  const mask = new Uint8Array(width * height);
  const limit = 42 * 42;
  for (let i = 0, p = 0; i < raster.data.length; i += 4, p += 1) {
    const dr = raster.data[i] - bg[0];
    const dg = raster.data[i + 1] - bg[1];
    const db = raster.data[i + 2] - bg[2];
    mask[p] = dr * dr + dg * dg + db * db > limit ? 1 : 0;
  }
  return closeMask(openMask(mask, width, height, 1), width, height, 2);
}

function interiorFromEdges(raster: Raster): Uint8Array {
  const width = raster.width;
  const height = raster.height;
  const gray = boxBlur(grayscale(raster), width, height, 1);
  const edges = new Uint8Array(width * height);
  let peak = 0;
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] + gray[i - width + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + width - 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const value = Math.hypot(gx, gy);
      mag[i] = value;
      if (value > peak) peak = value;
    }
  }
  const threshold = Math.max(24, peak * 0.22);
  for (let i = 0; i < mag.length; i += 1) {
    edges[i] = mag[i] >= threshold ? 1 : 0;
  }
  const barriers = dilate(edges, width, height, 2);
  const outside = floodFromBorder(barriers, width, height);
  const interior = new Uint8Array(width * height);
  for (let i = 0; i < interior.length; i += 1) {
    interior[i] = barriers[i] || outside[i] ? 0 : 1;
  }
  return closeMask(interior, width, height, 1);
}

function quadsFromMask(mask: Uint8Array | null, width: number, height: number): Quad[] {
  if (!mask) return [];
  const { labels, areas } = labelMask(mask, width, height);
  const imageArea = width * height;
  const quads: Quad[] = [];

  for (let id = 1; id < areas.length; id += 1) {
    const area = areas[id];
    if (area < imageArea * 0.02 || area > imageArea * 0.9) continue;
    const boundary = boundaryOf(labels, id, width, height);
    if (boundary.length < 12) continue;
    const hull = convexHull(subsample(boundary, 1200));
    const rect = minAreaRect(hull);
    if (!rect) continue;
    const long = Math.max(rect.width, rect.height);
    const short = Math.min(rect.width, rect.height);
    if (long < 24) continue;
    const ratio = short / long;
    if (ratio < 0.55 || ratio > 0.86) continue;
    if (area / (rect.width * rect.height) < 0.55) continue;
    const ordered = orderCorners(rect.corners);
    if (!ordered) continue;
    quads.push(ordered);
  }

  return quads;
}

function suppressOverlaps(quads: Quad[]): Quad[] {
  const kept: Quad[] = [];
  const sorted = [...quads].sort((a, b) => quadArea(b) - quadArea(a));
  for (const quad of sorted) {
    const overlaps = kept.some((other) => boundsIou(quadBounds(quad), quadBounds(other)) > 0.45);
    if (!overlaps) kept.push(quad);
  }
  return kept;
}

function orderCorners(corners: Point[]): Quad | null {
  if (corners.length !== 4) return null;
  const cx = corners.reduce((sum, point) => sum + point.x, 0) / 4;
  const cy = corners.reduce((sum, point) => sum + point.y, 0) / 4;
  const sorted = [...corners].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    const score = sorted[i].x + sorted[i].y;
    if (score < best) {
      best = score;
      start = i;
    }
  }
  return [0, 1, 2, 3].map((offset) => sorted[(start + offset) % 4]) as Quad;
}

function destToSourceHomography(quad: Quad, width: number, height: number): number[] | null {
  const dest: Point[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = dest[i];
    const X = quad[i].x;
    const Y = quad[i].y;
    matrix.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    vector.push(X);
    matrix.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    vector.push(Y);
  }
  const solved = solveLinear(matrix, vector);
  if (!solved) return null;
  return [...solved, 1];
}

function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-8) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let c = col; c <= n; c += 1) rows[col][c] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let c = col; c <= n; c += 1) rows[row][c] -= factor * rows[col][c];
    }
  }
  return rows.map((row) => row[n]);
}

function sampleBilinear(source: Raster, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x > source.width - 1 || y > source.height - 1) {
    return [0, 0, 0, 0];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, source.width - 1);
  const y1 = Math.min(y0 + 1, source.height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * source.width + x0) * 4;
  const i10 = (y0 * source.width + x1) * 4;
  const i01 = (y1 * source.width + x0) * 4;
  const i11 = (y1 * source.width + x1) * 4;
  const mix = (channel: number) => {
    const top = source.data[i00 + channel] * (1 - tx) + source.data[i10 + channel] * tx;
    const bottom = source.data[i01 + channel] * (1 - tx) + source.data[i11 + channel] * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return [mix(0), mix(1), mix(2), mix(3)];
}

function resizeRaster(source: Raster, width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  const xScale = source.width / width;
  const yScale = source.height / height;
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(source.height - 1, (y + 0.5) * yScale - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, (x + 0.5) * xScale - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const tx = sx - x0;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          source.data[(y0 * source.width + x0) * 4 + channel] * (1 - tx) +
          source.data[(y0 * source.width + x1) * 4 + channel] * tx;
        const bottom =
          source.data[(y1 * source.width + x0) * 4 + channel] * (1 - tx) +
          source.data[(y1 * source.width + x1) * 4 + channel] * tx;
        data[offset + channel] = top * (1 - ty) + bottom * ty;
      }
    }
  }
  return { width, height, data };
}

function grayscale(raster: Raster): Float32Array {
  const gray = new Float32Array(raster.width * raster.height);
  for (let i = 0, p = 0; i < raster.data.length; i += 4, p += 1) {
    gray[p] = raster.data[i] * 0.299 + raster.data[i + 1] * 0.587 + raster.data[i + 2] * 0.114;
  }
  return gray;
}

function boxBlur(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      sum += source[y * width + clamp(x, 0, width - 1)];
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / window;
      sum -= source[y * width + clamp(x - radius, 0, width - 1)];
      sum += source[y * width + clamp(x + radius + 1, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      sum += horizontal[clamp(y, 0, height - 1) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / window;
      sum -= horizontal[clamp(y - radius, 0, height - 1) * width + x];
      sum += horizontal[clamp(y + radius + 1, 0, height - 1) * width + x];
    }
  }
  return out;
}

function medianColor(raster: Raster, x: number, y: number, width: number, height: number): [number, number, number] {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const x0 = clamp(Math.round(x), 0, raster.width - 1);
  const y0 = clamp(Math.round(y), 0, raster.height - 1);
  const x1 = clamp(x0 + width, x0 + 1, raster.width);
  const y1 = clamp(y0 + height, y0 + 1, raster.height);
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const i = (yy * raster.width + xx) * 4;
      reds.push(raster.data[i]);
      greens.push(raster.data[i + 1]);
      blues.push(raster.data[i + 2]);
    }
  }
  return [median(reds), median(greens), median(blues)];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function averageColor(colors: Array<[number, number, number]>): [number, number, number] {
  const sum = colors.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]] as [number, number, number],
    [0, 0, 0],
  );
  return [sum[0] / colors.length, sum[1] / colors.length, sum[2] / colors.length];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function openMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return dilate(erode(mask, width, height, radius), width, height, radius);
}

function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return erode(dilate(mask, width, height, radius), width, height, radius);
}

function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -radius; dy <= radius && !on; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (mask[yy * width + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 1;
      for (let dy = -radius; dy <= radius && on; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          on = 0;
          break;
        }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !mask[yy * width + xx]) {
            on = 0;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

function labelMask(mask: Uint8Array, width: number, height: number): { labels: Int32Array; areas: number[] } {
  const labels = new Int32Array(mask.length);
  const areas = [0];
  const stack: number[] = [];
  let current = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || labels[i]) continue;
    current += 1;
    let area = 0;
    labels[i] = current;
    stack.push(i);
    while (stack.length) {
      const idx = stack.pop() as number;
      area += 1;
      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !labels[next]) {
          labels[next] = current;
          stack.push(next);
        }
      }
    }
    areas[current] = area;
  }
  return { labels, areas };
}

function floodFromBorder(barriers: Uint8Array, width: number, height: number): Uint8Array {
  const outside = new Uint8Array(barriers.length);
  const stack: number[] = [];
  const seed = (index: number) => {
    if (!barriers[index] && !outside[index]) {
      outside[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % width;
    const y = (idx - x) / width;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (const next of neighbors) {
      if (next >= 0 && !barriers[next] && !outside[next]) {
        outside[next] = 1;
        stack.push(next);
      }
    }
  }
  return outside;
}

function boundaryOf(labels: Int32Array, id: number, width: number, height: number): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (labels[idx] !== id) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        labels[idx - 1] !== id ||
        labels[idx + 1] !== id ||
        labels[idx - width] !== id ||
        labels[idx + width] !== id;
      if (edge) points.push({ x, y });
    }
  }
  return points;
}

function subsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: Point[] = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.floor(i * step)]);
  return out;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y);
  if (sorted.length <= 2) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function minAreaRect(hull: Point[]): { corners: Point[]; width: number; height: number } | null {
  if (hull.length < 3) return null;
  let best: { corners: Point[]; width: number; height: number; area: number } | null = null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const length = Math.hypot(edgeX, edgeY);
    if (length < 1) continue;
    const ux = edgeX / length;
    const uy = edgeY / length;
    const vx = -uy;
    const vy = ux;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const point of hull) {
      const u = (point.x - a.x) * ux + (point.y - a.y) * uy;
      const v = (point.x - a.x) * vx + (point.y - a.y) * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const width = maxU - minU;
    const height = maxV - minV;
    const area = width * height;
    if (!best || area < best.area) {
      const toPoint = (u: number, v: number): Point => ({
        x: a.x + u * ux + v * vx,
        y: a.y + u * uy + v * vy,
      });
      best = {
        width,
        height,
        area,
        corners: [
          toPoint(minU, minV),
          toPoint(maxU, minV),
          toPoint(maxU, maxV),
          toPoint(minU, maxV),
        ],
      };
    }
  }
  return best;
}

function quadArea(quad: Quad): number {
  const bounds = quadBounds(quad);
  return (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0);
}

function quadBounds(quad: Quad) {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function boundsIou(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): number {
  const width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const height = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const intersection = width * height;
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
