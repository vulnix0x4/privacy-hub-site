import type { BrowserFamily } from './types';

/**
 * Snapshot of live-browser signals used by `detectBrowser`.
 *
 * Callers populate this from `navigator`, `matchMedia`, IntlTimezone, the
 * Permissions API, and a few small feature-probes before invoking the
 * detector. Everything is optional except the core identity fields because
 * some platforms (Safari Lockdown in particular) hide feature surfaces
 * aggressively.
 */
export interface DetectionSignals {
  userAgent: string;
  userAgentData?: {
    brands: Array<{ brand: string; version: string }>;
    mobile: boolean;
    platform: string;
  };
  /** Map of `permissionName → PermissionState` (or `'unsupported'`). */
  permissionShape: Record<string, 'granted' | 'denied' | 'prompt' | 'unsupported'>;
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
  isSecureContext: boolean;
  /**
   * True if JS-level canvas/audio/WebGL farbling is observable (implementer
   * determines how — e.g. repeated reads of the same canvas produce different
   * hashes). Used to distinguish Brave standard vs strict and Firefox FPP vs
   * ETP Standard.
   */
  farblingObserved?: boolean;
  /** Set by the caller when Safari Lockdown Mode is detectable. */
  lockdownModeObserved?: boolean;
  /** IANA timezone string. Tor Browser canonicalises to `'Etc/UTC'`. */
  timezone?: string;
  /** True if `navigator.mediaDevices.enumerateDevices()` returns a non-empty list. */
  mediaDevicesEnumerable?: boolean;
  /** True if a WebRTC PeerConnection construction succeeded. */
  webRtcEnabled?: boolean;
  /** True if `navigator.brave?.isBrave()` resolved truthy. Brave-only signal. */
  isBrave?: boolean;
}

export interface DetectionResult {
  family: BrowserFamily;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Heuristic browser-family detector (design doc §5.5). Never throws.
 *
 * Order matters: more specific rules run before more generic ones. The Tor /
 * Mullvad branch runs first because both ship Firefox-shaped UAs and would
 * otherwise match `firefox-*` heuristics. Brave runs before vanilla-chrome
 * for the same reason. Edge runs before vanilla-chrome because Edge also
 * ships `Chrome/` in its UA.
 */
export function detectBrowser(s: DetectionSignals): DetectionResult {
  try {
    return detect(s);
  } catch {
    // Never throw from a pure classifier — an unexpected input shape should
    // fall to `unknown` rather than crash the UI.
    return { family: 'unknown', confidence: 'low' };
  }
}

function detect(s: DetectionSignals): DetectionResult {
  const ua = s.userAgent ?? '';
  const isFirefoxUa = /Firefox\//.test(ua) && !/LibreWolf/.test(ua);
  const isChromiumUa = /Chrome\//.test(ua);
  const isEdgeUa = /Edg\//.test(ua);
  const isSafariUa = /Safari\//.test(ua) && !isChromiumUa;
  const isLibreWolfUa = /LibreWolf/.test(ua);

  // --- Tor / Mullvad (must run before firefox-* because both ship Firefox UAs)
  // Tor Browser: Firefox-shaped UA, timezone canonicalised to Etc/UTC, WebRTC
  // disabled and media-devices inaccessible. Mullvad Browser: same build
  // identity but WebRTC and mediaDevices remain enabled. (Design doc §5.5.)
  if (isFirefoxUa && s.timezone === 'Etc/UTC' && isLetterboxed(s)) {
    const torLikeSize = looksTor(s);
    if (torLikeSize && s.webRtcEnabled !== true && s.mediaDevicesEnumerable !== true) {
      return { family: 'tor-browser', confidence: 'high' };
    }
    if (torLikeSize && (s.webRtcEnabled === true || s.mediaDevicesEnumerable === true)) {
      // Mullvad is ambiguous with Tor: both ship the same fingerprinting
      // discipline but Mullvad leaves network features enabled. Confidence
      // drops to medium.
      return { family: 'mullvad-browser', confidence: 'medium' };
    }
  }

  // --- LibreWolf: explicit build-string signal
  if (isLibreWolfUa) {
    return { family: 'librewolf', confidence: 'high' };
  }

  // --- Edge: Chromium-family UA with Edg/ suffix
  if (isEdgeUa) {
    return { family: 'edge', confidence: 'high' };
  }

  // --- Brave: callers surface `navigator.brave?.isBrave()` via `s.isBrave`.
  // Farbling presence splits strict vs standard.
  const isBraveSignal = s.isBrave === true;
  if (isBraveSignal && isChromiumUa) {
    if (s.farblingObserved === true) {
      return { family: 'brave-strict', confidence: 'high' };
    }
    return { family: 'brave-standard', confidence: 'high' };
  }

  // --- Firefox variants
  if (isFirefoxUa) {
    // RFP: letterboxed inner viewport. §5.5 notes screen.innerWidth is a 200
    // multiple and innerHeight a 100 multiple.
    if (isLetterboxed(s)) {
      return { family: 'firefox-rfp', confidence: 'high' };
    }
    if (s.farblingObserved === true) {
      return { family: 'firefox-etp-strict', confidence: 'high' };
    }
    return { family: 'firefox-etp-standard', confidence: 'medium' };
  }

  // --- Safari
  if (isSafariUa) {
    if (s.lockdownModeObserved === true) {
      return { family: 'safari-lockdown', confidence: 'high' };
    }
    return { family: 'safari', confidence: 'high' };
  }

  // --- Vanilla Chromium (no Edge / Brave signals)
  if (isChromiumUa) {
    return { family: 'vanilla-chrome', confidence: 'medium' };
  }

  return { family: 'unknown', confidence: 'low' };
}

/**
 * Classic Firefox RFP / Tor letterbox test: inner viewport is quantised to
 * multiples of 200 x 100 px. Zero dimensions (happy-dom with no explicit
 * layout) count as letterboxed only if screen dimensions are also quantised —
 * otherwise it's just an empty test environment.
 */
function isLetterboxed(s: DetectionSignals): boolean {
  const { innerWidth, innerHeight } = s;
  if (innerWidth <= 0 || innerHeight <= 0) return false;
  return innerWidth % 200 === 0 && innerHeight % 100 === 0;
}

/**
 * Tor Browser's default inner-viewport quantisation caps at 1000 x 1000 and
 * steps in 200 x 100 increments. Mullvad Browser uses the same stepping.
 * We accept any 200 x 100 letterbox in the Tor/Mullvad range.
 */
function looksTor(s: DetectionSignals): boolean {
  return (
    s.innerWidth > 0 &&
    s.innerHeight > 0 &&
    s.innerWidth <= 2000 &&
    s.innerHeight <= 2000 &&
    s.innerWidth % 200 === 0 &&
    s.innerHeight % 100 === 0
  );
}
