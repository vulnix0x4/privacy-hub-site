/**
 * Shared types for the scanner core.
 *
 * These types are framework-agnostic: no imports from React/Astro. Everything
 * in `src/lib/scanner/` is pure TypeScript so it can be unit-tested in isolation
 * and re-used by the upcoming React island (Phase 5 UI).
 */

/**
 * The seven vector families recognised by the scanner. Maps to the encyclopedia
 * index page (`/en/vectors`) and drives card grouping in the UI.
 */
export type VectorFamily =
  | 'network'
  | 'fingerprint'
  | 'sensors'
  | 'permissions'
  | 'storage'
  | 'behavioral'
  | 'cross-site';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Prevalence = 'very-common' | 'common' | 'rare';

/**
 * Defense modes celebrated in the UI. Every non-`UNCHANGED` state except the
 * grey "INFO" variants is treated as a win for the user.
 *
 * Colour hints in the comments are the design-doc §5.3 tokens.
 */
export type DefenseMode =
  /** red — value stable and fingerprintable */
  | 'UNCHANGED'
  /** green — value replaced with a canonical fake (Tor / Mullvad / Firefox RFP) */
  | 'SPOOFED'
  /** green — value randomized per session/origin (Brave farbling) */
  | 'FARBLED'
  /** purple — value rounded to a small bucket set (Firefox FPP) */
  | 'QUANTIZED'
  /** blue — value missing or empty because the API was blocked/stripped */
  | 'BLOCKED'
  /** grey — publicly observable by every site regardless of browser (IP, Accept-Language, …) */
  | 'INFO-PUBLIC'
  /** grey — contextual, not a real fingerprint risk */
  | 'INFO-CONTEXT';

/**
 * Outcome of the 3-read stability probe. Downstream classifier turns
 * Stability + (known spoof / known bucket) into a DefenseMode.
 */
export type Stability = 'STABLE' | 'JITTERED' | 'ABSENT';

/**
 * Browser families detectable from live signals. Drives per-browser verdict
 * copy in the UI (design doc §5.5).
 */
export type BrowserFamily =
  | 'vanilla-chrome'
  | 'edge'
  | 'brave-standard'
  | 'brave-strict'
  | 'firefox-etp-standard'
  | 'firefox-etp-strict'
  | 'firefox-rfp'
  | 'librewolf'
  | 'safari'
  | 'safari-lockdown'
  | 'tor-browser'
  | 'mullvad-browser'
  | 'unknown';

/** A single read of a vector probe. Always captured; never throws out. */
export interface ProbeResult {
  vectorId: string;
  /** Whatever the probe returned — opaque to the framework. */
  value: unknown;
  /** If the probe threw, its message is surfaced here. */
  error?: string;
  durationMs: number;
}

/**
 * Result of running the same probe multiple times to classify stability.
 * `reads.length` is always ≥ 3 and ≤ 5.
 */
export interface StabilityResult {
  stability: Stability;
  reads: ProbeResult[];
  /** Error from the first read, if any — surfaced in the UI "details" row. */
  firstError?: string;
}

export interface VectorEntry {
  /** Slug; matches the encyclopedia page URL `/en/vectors/<id>`. */
  id: string;
  family: VectorFamily;
  severity: Severity;
  prevalence: Prevalence;
  title: string;
  /** Short one-line explainer used on the scanner card under the vector name. */
  oneLiner: string;
  /**
   * The probe function. Called up to 5 times by the stability probe runner.
   * Must return a ProbeResult every time — errors are caught internally.
   */
  probe: () => Promise<ProbeResult>;
  /**
   * Whether this vector participates in automatic scans. `false` for
   * permission-gated "deep scan" vectors that require a user gesture.
   */
  automatic: boolean;
}
