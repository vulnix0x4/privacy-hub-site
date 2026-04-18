/**
 * Vector probe: `webgl-fingerprinting`
 *
 * Reads the WebGL vendor + renderer parameters, including the unmasked
 * GPU strings exposed via `WEBGL_debug_renderer_info` when available.
 *
 * Chrome, Edge, vanilla Firefox, and Safari all still expose the unmasked
 * GPU name — that single string narrows you to a few thousand peers.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'webgl-fingerprinting';

interface WebGLValue {
  vendor: string | null;
  renderer: string | null;
  unmaskedVendor: string | null;
  unmaskedRenderer: string | null;
  version: string | null;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    if (typeof document === 'undefined') {
      return done(start, { status: 'unsupported' });
    }
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return done(start, { status: 'unsupported' });
    }

    const vendor = stringify(gl.getParameter(gl.VENDOR));
    const renderer = stringify(gl.getParameter(gl.RENDERER));
    const version = stringify(gl.getParameter(gl.VERSION));

    let unmaskedVendor: string | null = null;
    let unmaskedRenderer: string | null = null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as
      | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number }
      | null;
    if (ext) {
      unmaskedVendor = stringify(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
      unmaskedRenderer = stringify(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    }

    const value: WebGLValue = {
      vendor,
      renderer,
      unmaskedVendor,
      unmaskedRenderer,
      version,
    };
    return done(start, value);
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
  }
}

function stringify(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function done(start: number, value: unknown): ProbeResult {
  return {
    vectorId: VECTOR_ID,
    value,
    durationMs: Math.max(0, now() - start),
  };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
