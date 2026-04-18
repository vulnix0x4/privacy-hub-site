/**
 * Vector probe: `speech-synthesis-voices`
 *
 * Enumerates the Web Speech API voices. The list is a near-perfect proxy
 * for the OS build + installed language packs. Voices load asynchronously
 * on first call in most browsers; we do a short re-read after 100ms.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'speech-synthesis-voices';

interface VoiceShape {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const ss =
      typeof globalThis.speechSynthesis !== 'undefined'
        ? globalThis.speechSynthesis
        : undefined;
    if (!ss || typeof ss.getVoices !== 'function') {
      return done(start, { voices: [], status: 'unsupported' });
    }
    let list = ss.getVoices();
    if (list.length === 0) {
      await sleep(100);
      list = ss.getVoices();
    }
    const voices: VoiceShape[] = list.map((v) => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
      localService: v.localService,
    }));
    return done(start, { voices });
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
