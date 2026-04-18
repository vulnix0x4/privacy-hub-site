/**
 * Vector probe: `audio-fingerprinting`
 *
 * Builds an OfflineAudioContext, pipes a silent oscillator through a
 * DynamicsCompressor, renders 1s of mono audio at 44.1 kHz, then folds
 * the resulting samples into a single SHA-256 hash of the hex-encoded
 * floats. The output depends on the audio stack — different OS builds
 * produce different rasterisations of the compressor curve.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'audio-fingerprinting';

interface WebkitWindow {
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const win = typeof window !== 'undefined' ? window : undefined;
    if (!win) {
      return done(start, { status: 'unsupported' });
    }
    const OAC =
      (win as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
        .OfflineAudioContext ??
      (win as unknown as WebkitWindow).webkitOfflineAudioContext;
    if (!OAC) {
      return done(start, { status: 'unsupported' });
    }

    const ctx = new OAC(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10_000;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);

    // Fold the 44100 floats into a compact digest string, then SHA-256.
    // The mid-slice is where the compressor curve stabilises in canonical
    // audio-fingerprint implementations.
    const sliceEnd = Math.min(data.length, 45_000);
    const sliceStart = Math.max(0, sliceEnd - 1000);
    let acc = 0;
    for (let i = sliceStart; i < sliceEnd; i++) {
      acc += Math.abs(data[i] ?? 0);
    }
    const hash = await sha256Hex(acc.toFixed(6));
    return done(start, { hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // happy-dom may provide a partial OfflineAudioContext stub — report
    // as unsupported rather than error if the failure was structural.
    if (/not implemented|undefined is not a function|not a constructor/i.test(msg)) {
      return done(start, { status: 'unsupported' });
    }
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: msg,
      durationMs: Math.max(0, now() - start),
    };
  }
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return ('fallback:' + (h >>> 0).toString(16)).padEnd(16, '0');
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
