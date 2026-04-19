/**
 * Pure "Ghost hash" computation.
 *
 * The Ghost Demo on the homepage shows visitors a short fingerprint hash
 * that is stable across the same device — including across Brave's farbling
 * and across incognito / private-window sessions. This module is framework-
 * agnostic: callers gather the ~16 input signals, hand them to
 * {@link computeGhostHash}, and get back a SHA-256 hex digest plus a short
 * display form.
 *
 * Nothing in this module touches a network, a server, or any storage. Tests
 * can call it directly with synthetic vectors — the shape is deterministic.
 */
import type { GhostVector } from './types';

/**
 * The field-by-field input shape for {@link computeGhostHash}. Every signal
 * here is chosen to survive Brave's per-session farbling and incognito-mode
 * storage clearing: timezone / locale / OS / screen dims / user preferences
 * / feature-support bitmap.
 *
 * Deliberately excluded (they would break the stability promise):
 * - Canvas / WebGL / AudioContext fingerprints (Brave farbles)
 * - Font enumeration (Brave farbles)
 * - Full user-agent minor version (Brave farbles)
 * - Hardware concurrency / device memory (Brave farbles per v2 spec)
 * - IP address (requires network fetch; breaks "no server" promise)
 */
export interface GhostHashInputs {
  /** IANA timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timezone: string;
  /** Minutes offset from UTC via `new Date().getTimezoneOffset()`. */
  timezoneOffset: number;
  /** Primary `navigator.language`. */
  language: string;
  /** Full `navigator.languages` array, capped and stable-sorted. */
  languages: readonly string[];
  /** `navigator.platform`, e.g. `MacIntel`, `Win32`, `Linux x86_64`. */
  platform: string;
  /** Major browser brand extracted from the UA string (`Chrome` / `Firefox` / …). */
  uaBrand: string;
  /** Heuristic mobile flag from UA regex. */
  uaMobile: boolean;
  /** `[screen.width, screen.height]` — DPR omitted because Brave farbles it. */
  screen: readonly [number, number];
  /** `screen.colorDepth`. Stable on Brave. */
  colorDepth: number;
  /** `screen.pixelDepth`. Stable on Brave. */
  pixelDepth: number;
  /** `navigator.maxTouchPoints`. Stable across private browsing. */
  maxTouchPoints: number;
  /** `navigator.cookieEnabled`. Effectively always true but recorded for completeness. */
  cookieEnabled: boolean;
  /** `matchMedia('(prefers-color-scheme: dark|light)')` resolution. */
  prefersColorScheme: string;
  /** `matchMedia('(prefers-reduced-motion: reduce)')` resolution. */
  prefersReducedMotion: string;
  /** `matchMedia('(prefers-contrast: more|less|custom)')` resolution. */
  prefersContrast: string;
  /** Bitmap over a fixed list of 20 browser-API capabilities (see types.ts). */
  features: number;
}

/** Result returned by {@link computeGhostHash}. */
export interface GhostHashResult {
  /** Full 64-char SHA-256 hex. */
  hash: string;
  /** Last 6 chars of `hash` for display ("…7f3c2a"). */
  short: string;
  /** The exact JSON string that was hashed, for audit/debug. */
  vector: string;
}

/**
 * Build a canonical {@link GhostVector} from loose inputs. Separated so
 * tests and real callers produce byte-identical canonical forms for equal
 * inputs.
 *
 * `languages` is sorted-unique to immunise against array-order drift.
 * (Brave doesn't re-order languages but conservative canonicalisation
 * makes us robust to future collectors that do.)
 */
export function buildGhostVector(inputs: GhostHashInputs): GhostVector {
  const langs = Array.from(new Set(inputs.languages)).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  // Return keys in a fixed order so JSON.stringify produces stable bytes.
  return {
    timezone: inputs.timezone,
    timezoneOffset: inputs.timezoneOffset,
    language: inputs.language,
    languages: langs,
    platform: inputs.platform,
    uaBrand: inputs.uaBrand,
    uaMobile: inputs.uaMobile,
    screen: [inputs.screen[0], inputs.screen[1]],
    colorDepth: inputs.colorDepth,
    pixelDepth: inputs.pixelDepth,
    maxTouchPoints: inputs.maxTouchPoints,
    cookieEnabled: inputs.cookieEnabled,
    prefersColorScheme: inputs.prefersColorScheme,
    prefersReducedMotion: inputs.prefersReducedMotion,
    prefersContrast: inputs.prefersContrast,
    features: inputs.features,
  };
}

/**
 * Compute the Ghost hash for a given input vector.
 *
 * Uses `crypto.subtle.digest('SHA-256', ...)` — available in every modern
 * browser and in Node 20+ (`globalThis.crypto`). If SubtleCrypto is missing
 * (ancient happy-dom build), a small DJB2-derived fallback keeps the
 * function deterministic for unit tests; this branch is never reached in
 * production.
 */
export async function computeGhostHash(inputs: GhostHashInputs): Promise<GhostHashResult> {
  const vector = buildGhostVector(inputs);
  const serialized = JSON.stringify(vector);
  const hash = await sha256Hex(serialized);
  return {
    hash,
    short: hash.slice(-6),
    vector: serialized,
  };
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
  // Fallback — only for environments without SubtleCrypto. Not cryptographic,
  // still deterministic so tests stay meaningful.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return ('fallback' + (h >>> 0).toString(16)).padEnd(64, '0');
}
