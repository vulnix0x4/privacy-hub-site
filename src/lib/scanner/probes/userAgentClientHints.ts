/**
 * Vector probe: `user-agent-and-client-hints`
 *
 * Reads `navigator.userAgent` plus the UA-CH low- and high-entropy values
 * when available. UA-CH supplements the user-agent string — it doesn't
 * replace it.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'user-agent-and-client-hints';

interface UADataLow {
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
  platform: string;
}
interface UADataWithHighEntropy extends UADataLow {
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

const HIGH_ENTROPY_HINTS = [
  'platformVersion',
  'model',
  'architecture',
  'bitness',
  'wow64',
  'fullVersionList',
] as const;

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    if (typeof navigator === 'undefined') {
      return done(start, { userAgent: '', userAgentData: null });
    }
    const userAgent = navigator.userAgent ?? '';
    const uaData = (navigator as { userAgentData?: UADataWithHighEntropy })
      .userAgentData;
    if (!uaData) {
      return done(start, { userAgent, userAgentData: null });
    }

    const low: UADataLow = {
      brands: Array.isArray(uaData.brands) ? uaData.brands.slice() : [],
      mobile: Boolean(uaData.mobile),
      platform: typeof uaData.platform === 'string' ? uaData.platform : '',
    };

    let high: Record<string, unknown> | null = null;
    if (typeof uaData.getHighEntropyValues === 'function') {
      try {
        high = await uaData.getHighEntropyValues([...HIGH_ENTROPY_HINTS]);
      } catch {
        high = null;
      }
    }

    return done(start, { userAgent, userAgentData: { ...low, highEntropy: high } });
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
