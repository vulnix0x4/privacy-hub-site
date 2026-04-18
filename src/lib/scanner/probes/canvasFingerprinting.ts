/**
 * Vector probe: `canvas-fingerprinting`
 *
 * Renders a mix of text, emoji, and shapes into a 220x30 2D canvas, then
 * hashes the resulting data URL with SHA-256 and returns the hex digest.
 *
 * The hash is what identifies you: two devices with the same browser build
 * and GPU driver produce identical hashes; any subtle difference in font
 * rasterisation, anti-aliasing, or emoji rendering changes every byte.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'canvas-fingerprinting';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const canvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : null;
    if (!canvas) {
      return {
        vectorId: VECTOR_ID,
        value: { status: 'unsupported' },
        durationMs: Math.max(0, now() - start),
      };
    }
    canvas.width = 220;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        vectorId: VECTOR_ID,
        value: { status: 'unsupported' },
        durationMs: Math.max(0, now() - start),
      };
    }

    // Mix alpha text with a pictograph and a coloured shape. The specific
    // string doesn't matter — it just has to be heterogeneous enough to
    // exercise the rasteriser.
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Cwm fjordbank glyphs vext quiz \u{1F600}', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Cwm fjordbank glyphs vext quiz \u{1F600}', 4, 17);

    const dataUrl = canvas.toDataURL('image/png');
    const hash = await sha256Hex(dataUrl);
    return {
      vectorId: VECTOR_ID,
      value: { hash },
      durationMs: Math.max(0, now() - start),
    };
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
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
  // Fallback DJB2 hash folded into 64 hex chars. Not cryptographic — only
  // reached in environments without SubtleCrypto (unit tests).
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return ('fallback:' + (h >>> 0).toString(16)).padEnd(16, '0');
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
