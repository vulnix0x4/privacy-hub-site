/**
 * Pure "Ghost hash" computation.
 *
 * The Ghost Demo on the homepage shows visitors a short fingerprint hash
 * that is stable across visits as long as their browser/device surface is
 * stable. This module is framework-agnostic: callers gather the six input
 * signals (canvas + audio + UA + screen + timezone + top-N fonts), hand them
 * to {@link computeGhostHash}, and get back a SHA-256 hex digest plus a
 * short display form.
 *
 * Nothing in this module touches a network, a server, or any storage. Tests
 * can call it directly with synthetic vectors — the shape is deterministic.
 */
import type { GhostVector } from './types';

/**
 * The six-field vector that feeds the Ghost hash. Every field is either a
 * pre-computed string (canvas/audio are already SHA-256 hex from the probes)
 * or a small, stable primitive. Order is fixed; JSON-stringify key order is
 * the lexical order the vector was built with (explicitly controlled below).
 */
export interface GhostHashInputs {
  /** SHA-256 hex of the 2D canvas data URL. */
  canvas: string;
  /** SHA-256 hex of the folded OfflineAudioContext output. */
  audio: string;
  /** `navigator.userAgent`. */
  userAgent: string;
  /** `[screen.width, screen.height, window.devicePixelRatio]`. */
  screen: readonly [number, number, number];
  /** IANA timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timezone: string;
  /** Up to 30 detected fonts, sorted ascending for stable hashing. */
  fonts: readonly string[];
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
 * Build a canonical {@link GhostVector} from loose inputs. Separated so tests
 * and real callers produce byte-identical canonical forms for equal inputs.
 *
 * Fonts are sorted ascending and capped at 30 entries to match the design-doc
 * §6 "top 30 from the existing font-enumeration probe" shape.
 */
export function buildGhostVector(inputs: GhostHashInputs): GhostVector {
  const fonts = [...inputs.fonts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 30);
  // Return keys in a fixed order so JSON.stringify produces stable bytes.
  return {
    canvas: inputs.canvas,
    audio: inputs.audio,
    userAgent: inputs.userAgent,
    screen: [inputs.screen[0], inputs.screen[1], inputs.screen[2]],
    timezone: inputs.timezone,
    fonts,
  };
}

/**
 * Compute the Ghost hash for a given input vector.
 *
 * Uses `crypto.subtle.digest('SHA-256', ...)` — available in every modern
 * browser and in Node 20+ (`globalThis.crypto`). If SubtleCrypto is missing
 * (ancient happy-dom build), a small DJB2-derived fallback keeps the function
 * deterministic for unit tests; this branch is never reached in production.
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
