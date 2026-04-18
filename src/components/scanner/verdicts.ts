/**
 * Per-browser verdict templates (design doc §5.5).
 *
 * Each entry is plain, opinionated copy the hero renders once browser-family
 * detection completes. The tone follows design doc §2.1: direct, no corporate
 * hedging, BLOCKED/FARBLED/SPOOFED/QUANTIZED are celebration states.
 *
 * Keyed off `BrowserFamily` — every enumerated value must have an entry. The
 * matching test (`verdicts.test.ts`) asserts 13 keys and that every
 * headline/detail is a non-empty string, so adding a new BrowserFamily member
 * fails CI until the copy lands.
 */
import type { BrowserFamily } from '../../lib/scanner/types';

export interface BrowserVerdict {
  headline: string;
  detail: string;
}

export const VERDICT_BY_BROWSER: Record<BrowserFamily, BrowserVerdict> = {
  'tor-browser': {
    headline: "You're in the Tor anonymity set.",
    detail:
      "Your fingerprint matches every other Tor Browser user on this major version. That's the win — and your network path is onion-routed on top of it.",
  },
  'mullvad-browser': {
    headline: 'Mullvad Browser bucket.',
    detail:
      "Tor Browser's uniformity without the Tor network. WebRTC and media devices stay enabled, so your bucket is smaller than Tor's — Mullvad is its own fingerprint, not Tor's.",
  },
  'brave-strict': {
    headline: "Brave Strict is doing its job.",
    detail:
      "Canvas, audio, WebGL, fonts — farbled per session and eTLD+1. Heads up: 2025 research (\"Breaking the Shield\") showed averaging attacks can partially defeat single-read farbling, so dedicated trackers can still reconstruct across repeated visits.",
  },
  'brave-standard': {
    headline: 'Brave Standard shields.',
    detail:
      "Farbling on a smaller set of vectors than Strict. Switch to Strict in brave://settings/shields for full per-session rotation on canvas, WebGL, and audio.",
  },
  'firefox-rfp': {
    headline: "You're in the Firefox RFP cohort.",
    detail:
      "Uniform quantization kicks in across canvas, fonts, timezone, and screen dimensions — your bucket is small and deliberate. Expect some sites to behave oddly; that's the deal you signed up for.",
  },
  'firefox-etp-strict': {
    headline: 'Firefox ETP Strict with FPP active.',
    detail:
      "Your browser is quantizing canvas, fonts, and hardware properties to common buckets. FPP is strong on a named list of vectors and passive on the rest — the scanner tells you which is which.",
  },
  'firefox-etp-standard': {
    headline: "Firefox ETP Standard — FPP is off.",
    detail:
      "You're running Firefox's default Enhanced Tracking Protection. FPP is NOT active in Standard mode — your fingerprint is closer to vanilla Chrome than most Firefox users assume. Switch to Strict to enable FPP.",
  },
  librewolf: {
    headline: 'LibreWolf with RFP on by default.',
    detail:
      "LibreWolf flips the same switches as Firefox RFP out of the box, plus arkenfox-style hardening. You're in the Firefox RFP cohort for most vectors; the build string identifies you as LibreWolf specifically.",
  },
  safari: {
    headline: 'Safari 26 with Advanced Fingerprinting Protection.',
    detail:
      "AFP is enabled everywhere by default in Safari 26 — canvas, WebGL, AudioContext, and speech readbacks get protection when known-fingerprinter scripts run. Not everything is covered, but the headline vectors are.",
  },
  'safari-lockdown': {
    headline: 'Safari Lockdown Mode is engaged.',
    detail:
      "You've opted into the tightest profile Apple ships. WebGL, WebAssembly, and web fonts are all neutered; canvas and audio APIs return constants. Sites will break — that's the point.",
  },
  edge: {
    headline: 'Edge has no equivalent to ETP Strict.',
    detail:
      "You're close to vanilla Chrome for fingerprinting purposes — the Chromium-based Edge inherits no meaningful fingerprint protection from Microsoft. The scanner lists the shortest path to cut your exposure below.",
  },
  'vanilla-chrome': {
    headline: 'Vanilla Chrome — sites can fingerprint you on most vectors.',
    detail:
      "Chrome ships no fingerprinting defense by default. The cards below are your shortest path — Brave, Firefox + ETP Strict, or Tor Browser are the big-lever switches, plus uBlock Origin if you're staying put.",
  },
  unknown: {
    headline: "Couldn't identify your browser family.",
    detail:
      "The detector didn't match any known profile — you might be on a very new build, a custom fork, or a privacy-hardened environment we haven't catalogued yet. Scanner results below are still accurate per-vector.",
  },
};
