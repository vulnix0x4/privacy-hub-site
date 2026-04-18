/**
 * Vector probe: `font-enumeration`
 *
 * Measures the rendered width of a baseline string in each of three
 * fallback-only fonts, then in each candidate font with the same fallback.
 * If any of the three measurements changes, the candidate font is installed
 * on the device.
 *
 * The candidate list is intentionally a small allow-list of 30 common
 * fonts — the set is what identifies you, not the enumeration technique.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'font-enumeration';

const BASELINE_FONTS = ['monospace', 'sans-serif', 'serif'] as const;
const TEST_STRING = 'mmmmmmmmmmlli';
const TEST_SIZE = '72px';

const CANDIDATE_FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Comic Sans MS',
  'Trebuchet MS',
  'Arial Black',
  'Impact',
  'Tahoma',
  'Palatino',
  'Garamond',
  'Bookman',
  'Avant Garde',
  'Andale Mono',
  'Calibri',
  'Cambria',
  'Consolas',
  'Segoe UI',
  'Optima',
  'Futura',
  'Geneva',
  'Lucida Console',
  'Lucida Sans',
  'Monaco',
  'Helvetica Neue',
  'San Francisco',
  'SF Pro',
  'Inter',
] as const;

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    if (typeof document === 'undefined' || !document.body) {
      return done(start, { installed: [] });
    }

    // Create a hidden off-screen span for measurement.
    const span = document.createElement('span');
    span.textContent = TEST_STRING;
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.top = '-9999px';
    span.style.fontSize = TEST_SIZE;
    span.style.visibility = 'hidden';
    document.body.appendChild(span);

    try {
      // Baseline widths for each fallback family.
      const baselineWidths: Record<string, number> = {};
      for (const base of BASELINE_FONTS) {
        span.style.fontFamily = base;
        baselineWidths[base] = span.getBoundingClientRect().width;
      }

      const installed: string[] = [];
      for (const font of CANDIDATE_FONTS) {
        let detected = false;
        for (const base of BASELINE_FONTS) {
          span.style.fontFamily = `"${font}", ${base}`;
          const w = span.getBoundingClientRect().width;
          if (w !== baselineWidths[base]) {
            detected = true;
            break;
          }
        }
        if (detected) installed.push(font);
      }

      return done(start, { installed });
    } finally {
      try {
        document.body.removeChild(span);
      } catch {
        // ignore DOM teardown race.
      }
    }
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
