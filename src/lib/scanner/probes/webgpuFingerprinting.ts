/**
 * Vector probe: `webgpu-fingerprinting`
 *
 * Requests a WebGPU adapter and, if available, its `requestAdapterInfo()`
 * payload. The four-field adapter info (vendor, architecture, device,
 * description) is more revealing than the old WebGL unmasked pair — and
 * protections lag the specification.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'webgpu-fingerprinting';

interface GPUAdapterInfoShape {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}
interface GPUAdapterShape {
  requestAdapterInfo?: () => Promise<GPUAdapterInfoShape>;
  info?: GPUAdapterInfoShape;
}
interface NavigatorWithGpu {
  gpu?: { requestAdapter: () => Promise<GPUAdapterShape | null> };
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as NavigatorWithGpu)
        : undefined;
    if (!nav?.gpu) {
      return done(start, { status: 'unsupported' });
    }
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return done(start, { status: 'unavailable' });
    }
    // Some browsers expose the info lazily via `adapter.info`; others require
    // the older async `requestAdapterInfo()`. Try both.
    let info: GPUAdapterInfoShape | undefined;
    if (typeof adapter.requestAdapterInfo === 'function') {
      info = await adapter.requestAdapterInfo();
    } else if (adapter.info) {
      info = adapter.info;
    }
    const value = {
      vendor: info?.vendor ?? null,
      architecture: info?.architecture ?? null,
      device: info?.device ?? null,
      description: info?.description ?? null,
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
