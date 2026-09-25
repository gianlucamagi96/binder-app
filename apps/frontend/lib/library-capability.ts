/** Below this many logical cores the library view is skipped. */
export const LIBRARY_MIN_CORES = 4;

/** Below this many GB (Navigator.deviceMemory) the library view is skipped. */
export const LIBRARY_MIN_DEVICE_MEMORY_GB = 4;

/**
 * A single clear+finish slower than this is treated as a software or stalled GPU.
 * Healthy desktops land well under 10ms; the budget leaves room for a cold driver.
 */
export const LIBRARY_FRAME_BUDGET_MS = 50;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

export type LibraryProbe = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  webgl: boolean;
  frameMs: number;
  softwareRenderer: boolean;
};

export function librarySupported(probe: LibraryProbe): boolean {
  if (!probe.webgl || probe.softwareRenderer) return false;
  if (
    typeof probe.hardwareConcurrency === "number" &&
    probe.hardwareConcurrency > 0 &&
    probe.hardwareConcurrency < LIBRARY_MIN_CORES
  ) {
    return false;
  }
  if (
    typeof probe.deviceMemory === "number" &&
    probe.deviceMemory > 0 &&
    probe.deviceMemory < LIBRARY_MIN_DEVICE_MEMORY_GB
  ) {
    return false;
  }
  if (probe.frameMs > LIBRARY_FRAME_BUDGET_MS) return false;
  return true;
}

function releaseContext(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

/**
 * Synchronous capability probe. Creates a throwaway context and releases it
 * so the real canvas is not competing for the browser's WebGL context limit.
 */
export function probeLibrarySupport(): LibraryProbe {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const hardwareConcurrency = nav.hardwareConcurrency;
  const deviceMemory = nav.deviceMemory;

  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;

  const attributes = { failIfMajorPerformanceCaveat: true, antialias: false };
  const gl = (canvas.getContext("webgl2", attributes) ??
    canvas.getContext("webgl", attributes)) as WebGL2RenderingContext | WebGLRenderingContext | null;

  if (!gl) {
    return {
      hardwareConcurrency,
      deviceMemory,
      webgl: false,
      frameMs: Number.POSITIVE_INFINITY,
      softwareRenderer: false,
    };
  }

  let softwareRenderer = false;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  if (debug) {
    const renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    softwareRenderer = typeof renderer === "string" && SOFTWARE_RENDERER.test(renderer);
  }

  const start = performance.now();
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.finish();
  const frameMs = performance.now() - start;

  releaseContext(gl);

  return { hardwareConcurrency, deviceMemory, webgl: true, frameMs, softwareRenderer };
}
