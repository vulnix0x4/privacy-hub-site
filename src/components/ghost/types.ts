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
 */
export interface GhostVector {
  canvas: string;
  audio: string;
  userAgent: string;
  screen: [number, number, number];
  timezone: string;
  fonts: string[];
}

/**
 * IndexedDB record shape. Stored as the single entry with id `'current'`
 * in the `mask` object store of the `privacy-hub-ghost` database. `firstSeen`
 * is the unix-ms timestamp of the first ever observation, `lastSeen` updates
 * on every visit.
 */
export interface MaskRecord {
  id: 'current';
  hash: string;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Verdict categories emitted by the Ghost Demo after a user runs a "Try to
 * hide" action and we re-hash their environment. Shown in the result panel.
 *
 *  - `persistent` — hash unchanged; the defense didn't work.
 *  - `drift` — hash changed; the defense worked.
 *  - `anonymity-set` — Tor/Mullvad/Brave-strict branch: framed as "you joined
 *    a crowd" rather than "you escaped the crowd."
 *  - `first-visit` — no stored hash existed before this scan.
 */
export type VerdictOutcome = 'persistent' | 'drift' | 'anonymity-set' | 'first-visit';

/** Re-export so the components file only needs to import from `./types`. */
export type { BrowserFamily };
