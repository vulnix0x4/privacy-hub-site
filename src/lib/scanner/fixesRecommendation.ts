/**
 * Top-3 fixes recommender.
 *
 * After the scan settles, we know which vectors are `UNCHANGED` (tracked) and
 * how many bits of entropy each represents. This module picks the 3 highest-
 * leverage user-actions from a fixed library — the ones that normalise the
 * largest bits-sum per unit of user effort.
 *
 * Greedy selection:
 *   1. For each fix in the library, compute `leverageBits` = sum of
 *      uniqueness bits for the UNCHANGED vectors the fix covers.
 *   2. Sort by `leverageBits` descending, with `effortMinutes` as the tie
 *      breaker (faster wins first).
 *   3. Greedy pick: take the top fix, subtract its covered set from the
 *      remaining UNCHANGED set, repeat until 3 picks or set is empty.
 *
 * Filters:
 *   - `skipForFamilies`: never suggest "switch to Brave" to a Brave user.
 *   - If a fix covers nothing in the unfixed set, drop it.
 *
 * The returned list is ordered by descending leverage. Callers display them
 * top-to-bottom with a per-fix badge for effort.
 *
 * @see ./fixesRecommendation.test.ts for the behaviour matrix across
 * browser families and scan outcomes.
 */
import { UNIQUENESS_BY_VECTOR } from './uniqueness';
import type { BrowserFamily } from './types';

export type FixEffort = 'fast' | 'medium' | 'slow';

export interface FixCandidate {
  id: string;
  title: string;
  /** Short sentence; the panel renders this below the title. */
  description: string;
  /** Effort bucket shown as a pill (keeps the UI honest about cost). */
  effort: FixEffort;
  effortMinutes: number;
  /** Vector ids this fix meaningfully normalises. */
  covers: readonly string[];
  /** Families this fix should NOT be suggested to (they already have it). */
  skipForFamilies?: readonly BrowserFamily[];
  /**
   * Optional deep-link target — a guide or vector page the UI can link to.
   * Relative URL, no origin.
   */
  learnMore?: string;
}

export interface RankedFix extends FixCandidate {
  /** Total bits of entropy this fix would remove from the unfixed set. */
  leverageBits: number;
  /** Human display form of the bits covered, e.g. "≈42 bits of entropy". */
  leverageLabel: string;
  /** The specific vector ids we're citing as coverage for this session. */
  coversInThisScan: string[];
}

export interface RecommendFixesInput {
  /** Vector ids currently classified as UNCHANGED in the scan. */
  unchangedVectorIds: readonly string[];
  /** Detected browser family — used to skip redundant suggestions. */
  browserFamily: BrowserFamily;
}

/**
 * Fix library. Each entry names the vectors it normalises; the recommender
 * scores them against the live scan result.
 *
 * Ordering inside this array does not matter — the scorer sorts.
 */
export const FIX_LIBRARY: readonly FixCandidate[] = [
  {
    id: 'switch-to-tor',
    title: 'Use Tor Browser for the activity you want un-linkable.',
    description:
      "Tor canonicalises almost every fingerprint surface so every visitor shares one identity. It is slow and some sites break — reach for it when you need it, not always.",
    effort: 'medium',
    effortMinutes: 10,
    covers: [
      'ip-geolocation',
      'canvas-fingerprinting',
      'webgl-fingerprinting',
      'audio-fingerprinting',
      'font-enumeration',
      'timezone-locale',
      'user-agent-and-client-hints',
      'navigator-properties',
      'screen-viewport',
      'media-devices',
      'speech-synthesis-voices',
      'webrtc-local-ip',
      'permissions-bitmap',
      'webgpu-fingerprinting',
    ],
    skipForFamilies: ['tor-browser'],
    learnMore: '/en/guides/tor-browser-first-run',
  },
  {
    id: 'switch-to-brave-strict',
    title: 'Switch to Brave with Strict shields.',
    description:
      'Farbles canvas, audio, WebGL, and media-device output per session and per eTLD+1. No config needed — strict is a single toggle.',
    effort: 'fast',
    effortMinutes: 15,
    covers: [
      'canvas-fingerprinting',
      'audio-fingerprinting',
      'webgl-fingerprinting',
      'media-devices',
      'webrtc-local-ip',
    ],
    skipForFamilies: ['brave-strict', 'tor-browser', 'mullvad-browser', 'librewolf'],
  },
  {
    id: 'enable-firefox-rfp',
    title: 'Flip privacy.resistFingerprinting on in Firefox.',
    description:
      "Firefox's RFP standardises timezone, screen, fonts, canvas, and WebGL to a fixed RFP bucket. Expect a few sites to break; most won't notice.",
    effort: 'fast',
    effortMinutes: 5,
    covers: [
      'canvas-fingerprinting',
      'webgl-fingerprinting',
      'audio-fingerprinting',
      'font-enumeration',
      'timezone-locale',
      'navigator-properties',
      'screen-viewport',
      'speech-synthesis-voices',
    ],
    skipForFamilies: [
      'firefox-rfp',
      'librewolf',
      'tor-browser',
      'mullvad-browser',
    ],
    learnMore: '/en/guides/harden-firefox',
  },
  {
    id: 'use-vpn',
    title: 'Route traffic through an audited VPN.',
    description:
      'Mullvad, IVPN, or Proton VPN give every customer the same exit IP. Your home address stops being one of your identifiers.',
    effort: 'fast',
    effortMinutes: 5,
    covers: ['ip-geolocation'],
    skipForFamilies: ['tor-browser'],
    learnMore: '/en/guides/mullvad-vpn-quickstart',
  },
  {
    id: 'enable-doh',
    title: 'Turn on DNS-over-HTTPS in your browser settings.',
    description:
      "One checkbox (Cloudflare 1.1.1.1 or Quad9 9.9.9.9). Your ISP stops seeing every domain you visit, and DNS queries stop leaking in plaintext.",
    effort: 'fast',
    effortMinutes: 2,
    covers: ['dns-leaks'],
    learnMore: '/en/guides/dns-over-https',
  },
  {
    id: 'install-ublock-origin',
    title: 'Install uBlock Origin and enable the WebRTC IP-leak toggle.',
    description:
      'Ships with the "Prevent WebRTC from leaking local IPs" option. Free, open source, no account.',
    effort: 'fast',
    effortMinutes: 3,
    covers: ['webrtc-local-ip', 'extension-detection'],
    learnMore: '/en/guides/ublock-origin-setup',
  },
  {
    id: 'use-containers',
    title: 'Separate identities into Firefox Containers or distinct profiles.',
    description:
      'One container per identity (work, personal, throwaway). Extensions and cookies stay isolated so the extension-detection surface shrinks per container.',
    effort: 'medium',
    effortMinutes: 10,
    covers: ['extension-detection', 'third-party-cookies-storage'],
    learnMore: '/en/guides/firefox-containers',
  },
  {
    id: 'update-browser',
    title: 'Update to the latest stable release.',
    description:
      'Older browsers have distinctive JA4 TLS fingerprints and older permission shapes. Being on the current stable puts you inside the biggest cohort.',
    effort: 'fast',
    effortMinutes: 3,
    covers: ['tls-ja4', 'permissions-bitmap'],
  },
  {
    id: 'switch-to-librewolf',
    title: 'Try LibreWolf for a Firefox build with RFP already on.',
    description:
      'Zero configuration: RFP, uBlock, and telemetry-off are the defaults. Your hash joins the LibreWolf cohort.',
    effort: 'medium',
    effortMinutes: 10,
    covers: [
      'canvas-fingerprinting',
      'webgl-fingerprinting',
      'audio-fingerprinting',
      'font-enumeration',
      'timezone-locale',
      'navigator-properties',
    ],
    skipForFamilies: [
      'librewolf',
      'tor-browser',
      'mullvad-browser',
      'firefox-rfp',
    ],
  },
] as const;

/**
 * Rank the fix library against a scan result and return the top N
 * (default 3) fixes by leverage bits. Returns an empty array if there are
 * no UNCHANGED vectors (nothing to fix — celebrate!).
 */
export function recommendFixes(
  input: RecommendFixesInput,
  limit = 3
): RankedFix[] {
  const unfixed = new Set(input.unchangedVectorIds);
  if (unfixed.size === 0) return [];

  const family = input.browserFamily;
  const candidates = FIX_LIBRARY.filter(
    (f) => !(f.skipForFamilies ?? []).includes(family)
  );

  const ranked: RankedFix[] = [];
  const remaining = new Set(unfixed);

  while (ranked.length < limit && remaining.size > 0) {
    let best: RankedFix | null = null;
    for (const fix of candidates) {
      if (ranked.find((r) => r.id === fix.id)) continue;
      const coversInThisScan = fix.covers.filter((v) => remaining.has(v));
      if (coversInThisScan.length === 0) continue;
      const leverageBits = coversInThisScan.reduce((sum, id) => {
        const row = UNIQUENESS_BY_VECTOR[id];
        return sum + (row?.mode === 'entropy' ? row.bits : 0);
      }, 0);
      // Tie-break: more coverage > less coverage, then lower effort > higher.
      if (
        !best ||
        leverageBits > best.leverageBits ||
        (leverageBits === best.leverageBits &&
          fix.effortMinutes < best.effortMinutes)
      ) {
        best = {
          ...fix,
          leverageBits,
          leverageLabel: formatLeverage(leverageBits),
          coversInThisScan,
        };
      }
    }
    if (!best) break;
    ranked.push(best);
    for (const id of best.coversInThisScan) remaining.delete(id);
  }

  return ranked;
}

function formatLeverage(bits: number): string {
  const rounded = Math.round(bits);
  if (rounded <= 0) return 'supporting fix';
  if (rounded === 1) return '≈1 bit of entropy removed';
  return `≈${rounded} bits of entropy removed`;
}
