/**
 * Shared types for the Ghost Demo island. Kept in a separate file so the
 * pure {@link computeGhostHash} module, the `maskStore` IndexedDB wrapper,
 * the `verdicts` copy bank, and the React component all speak the same
 * vocabulary without circular imports.
 */
import type { BrowserFamily } from '../../lib/scanner/types';

/**
 * The canonical, already-ordered object that gets JSON-stringified and then
 * SHA-256 hashed. Consumers shouldn't hand-construct this; use
 * {@link buildGhostVector} in `computeGhostHash.ts` to produce a valid one.
 *
 * Every field here is deliberately chosen to be **stable across Brave's
 * farbling and across incognito / private browsing on the same device**.
 * Canvas hashes, audio hashes, font enumeration, and full user-agent
 * strings are excluded because Brave v2 farbles them per session/origin —
 * including them would produce a drifting hash even for "same device,
 * same user" pairs. A sophisticated tracker correlating only the signals
 * here can still link sessions across Brave-incognito boundaries.
 */
export interface GhostVector {
  timezone: string;
  timezoneOffset: number;
  language: string;
  languages: string[];
  platform: string;
  uaBrand: string;
  uaMobile: boolean;
  screen: [number, number];
  colorDepth: number;
  pixelDepth: number;
  maxTouchPoints: number;
  cookieEnabled: boolean;
  prefersColorScheme: string;
  prefersReducedMotion: string;
  prefersContrast: string;
  /**
   * Bitmap over a fixed list of 20 browser-API capabilities (serviceWorker,
   * indexedDB, webGL, webGPU, OfflineAudioContext, speechSynthesis,
   * bluetooth, gamepad, wakeLock, share, clipboard, geolocation,
   * deviceOrientation, webCrypto, credentials, usb, serial, hid,
   * pushManager, payment). Stable across Brave farbling because none of
   * these API-presence checks are randomised. Serialised as a decimal
   * integer for compact JSON.
   */
  features: number;
}

/**
 * IndexedDB record shape. Stored as the single entry with id `'current'`
 * in the `mask` object store of the `privacy-hub-ghost` database.
 *
 * `firstSeen` is the unix-ms timestamp of the first ever observation,
 * `lastSeen` updates on every visit. The `hash` field is the SHA-256 of
 * the stable {@link GhostVector} — across the old (strict + resilient)
 * two-hash scheme and this unified scheme the field is still a plain
 * string, so old records remain readable even if their stored hash no
 * longer matches the newly-computed one (leading to a single "drift"
 * verdict on the first post-upgrade visit).
 */
export interface MaskRecord {
  id: 'current';
  hash: string;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Verdict categories emitted by the Ghost Demo after a user runs a "Try
 * to hide" action and we re-hash their environment. Shown in the result
 * panel.
 *
 *  - `persistent` — hash unchanged; the defense didn't work.
 *  - `drift` — hash changed; something environmental (IP change in the
 *    minority of signals we read, timezone, language prefs, ...) moved.
 *  - `anonymity-set` — Tor / Mullvad Browser branch: framed as "you
 *    joined the crowd" rather than "you escaped the crowd," because those
 *    browsers canonicalise the same stable signals we hash.
 *  - `first-visit` — no stored hash existed before this scan.
 */
export type VerdictOutcome = 'persistent' | 'drift' | 'anonymity-set' | 'first-visit';

/** Re-export so the components file only needs to import from `./types`. */
export type { BrowserFamily };
