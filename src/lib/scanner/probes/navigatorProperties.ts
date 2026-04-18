/**
 * Vector probe: `navigator-properties`
 *
 * Surfaces the twelve non-UA `navigator` scalars that every site sees for
 * free. None of these require a prompt; individually they feel harmless;
 * together they pin the device.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'navigator-properties';

interface NavigatorExtra {
  platform?: string;
  language?: string;
  languages?: readonly string[];
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
  vendor?: string;
  cookieEnabled?: boolean;
  doNotTrack?: string | null;
  pdfViewerEnabled?: boolean;
  webdriver?: boolean;
  oscpu?: string;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    if (typeof navigator === 'undefined') {
      return done(start, {});
    }
    const n = navigator as unknown as NavigatorExtra;
    const value = {
      platform: n.platform ?? null,
      language: n.language ?? null,
      languages: Array.isArray(n.languages) ? [...n.languages] : null,
      hardwareConcurrency: typeof n.hardwareConcurrency === 'number' ? n.hardwareConcurrency : null,
      deviceMemory: typeof n.deviceMemory === 'number' ? n.deviceMemory : null,
      maxTouchPoints: typeof n.maxTouchPoints === 'number' ? n.maxTouchPoints : null,
      vendor: n.vendor ?? null,
      cookieEnabled: typeof n.cookieEnabled === 'boolean' ? n.cookieEnabled : null,
      doNotTrack: n.doNotTrack ?? null,
      pdfViewerEnabled: typeof n.pdfViewerEnabled === 'boolean' ? n.pdfViewerEnabled : null,
      webdriver: typeof n.webdriver === 'boolean' ? n.webdriver : null,
      oscpu: typeof n.oscpu === 'string' ? n.oscpu : null,
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
