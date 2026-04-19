/**
 * Per-vector uniqueness estimator.
 *
 * For each registry vector we carry a rough Shannon-entropy estimate (in bits)
 * from published fingerprinting research, plus a short mitigation string the
 * scanner UI renders underneath the "1 in N" pill. Numbers are conservative —
 * we lean toward the lower end of the published range so we never overstate
 * how unique a visitor is.
 *
 * Sources (see per-entry `source` field for which one applies):
 *   - Eckersley 2010, "How Unique Is Your Web Browser?" (Panopticlick)
 *   - Laperdrix, Rudametkin, Baudry 2016, "Beauty and the Beast"
 *   - Laperdrix, Bielova, Baudry, Avoine 2020, ACM TWEB survey
 *   - Gomez-Boix, Laperdrix, Baudry 2018 WWW, 2M-browser corpus
 *   - Cao, Li, Wijmans 2017 NDSS, "Cross-Browser Fingerprinting"
 *   - Fifield & Egelman 2015 USENIX, font metrics
 *   - Englehardt & Narayanan 2016 CCS, 1M-site audit
 *   - Olejnik et al. 2016 W2SP, battery API
 *   - Mowery & Shacham 2012 W2SP, canvas + JS engine
 *   - Das et al. 2018 PETS, motion-sensor calibration
 *   - FoxIO 2023, JA4 distribution
 *
 * Some vectors (DNS leak, supercookies, federated-login probes, CDN bot
 * cookies) are *capability / re-identification* signals, not entropy signals.
 * For those we set `mode: 'context'` and skip the "1 in N" pill entirely;
 * the UI shows a brief mitigation instead. That keeps the math honest — we
 * don't want to claim a DoH resolver is worth 4 bits of entropy when the
 * reality is "your queries leak or they don't."
 *
 * @see ./uniqueness.test.ts for the exhaustiveness check covering every
 * catalog id.
 */
import { VECTOR_CATALOG } from './registry';

export type UniquenessBucket = 'common' | 'moderate' | 'rare';

export interface VectorUniquenessEntry {
  vectorId: string;
  /**
   * Whether this vector participates in the "1 in N" math. `entropy` entries
   * have a `bits` number and get a pill. `context` entries are capability
   * signals (DNS leak, supercookie reflection, bot cookies) that we surface
   * as a mitigation line only.
   */
  mode: 'entropy' | 'context';
  /** Shannon entropy estimate in bits. Only meaningful when `mode === 'entropy'`. */
  bits: number;
  /** Colour / prioritisation bucket for the UI. */
  bucket: UniquenessBucket;
  /** Single-sentence mitigation in imperative voice. */
  mitigation: string;
  /** Citation string — shown on hover in `<abbr title>` for transparency. */
  source: string;
  /**
   * True when `bits` is a reasoned guess (no single published study gives a
   * number we can cite). We still surface it but the pill carries a subtle
   * "approx" marker so we don't over-claim.
   */
  guessed: boolean;
}

/**
 * Uniqueness table keyed by the same `id`s the vector catalog uses. Every
 * registry entry MUST have a corresponding row here — see
 * `assertUniquenessCoverage` in the test.
 */
export const UNIQUENESS_BY_VECTOR: Record<string, VectorUniquenessEntry> = {
  // --- network ---
  'ip-geolocation': {
    vectorId: 'ip-geolocation',
    mode: 'entropy',
    bits: 20,
    bucket: 'rare',
    mitigation:
      "Use an audited VPN or Tor so every site sees a shared exit IP, not your home address.",
    source:
      'Reasoned estimate: IPv4 /24 clusters serving ~256 households in residential allocations give ~20 bits of distinguishing power per public IP.',
    guessed: true,
  },
  'tls-ja4': {
    vectorId: 'tls-ja4',
    mode: 'entropy',
    bits: 6,
    bucket: 'moderate',
    mitigation:
      'Use a stock mainstream browser at the latest stable build so your JA4 matches the biggest crowd.',
    source:
      'FoxIO 2023 JA4 distribution — client populations cluster into 30-100 JA4s per release wave.',
    guessed: false,
  },
  'dns-leaks': {
    vectorId: 'dns-leaks',
    mode: 'context',
    bits: 0,
    bucket: 'moderate',
    mitigation:
      'Turn on DNS-over-HTTPS in your browser (Cloudflare, Quad9, or NextDNS) so queries stop leaking to your ISP.',
    source:
      'Not a Shannon-entropy signal — either your resolver is encrypted or it is not.',
    guessed: false,
  },
  'webrtc-local-ip': {
    vectorId: 'webrtc-local-ip',
    mode: 'entropy',
    bits: 8,
    bucket: 'moderate',
    mitigation:
      'In Brave: Shields → WebRTC IP Handling → "Disable non-proxied UDP". In Firefox: flip `media.peerconnection.enabled` to false.',
    source:
      'Conservative estimate: private-IP space + interface-name tuple — Laperdrix 2020 notes WebRTC local IP as a discrete linker, EFF Cover Your Tracks scores it in this range.',
    guessed: true,
  },

  // --- fingerprint ---
  'canvas-fingerprinting': {
    vectorId: 'canvas-fingerprinting',
    mode: 'entropy',
    bits: 11,
    bucket: 'rare',
    mitigation:
      'Use Brave (farbles canvas output per-session per-origin) or Firefox with privacy.resistFingerprinting.',
    source:
      'Laperdrix 2016 measured 8.28 bits on AmIUnique; Gomez-Boix 2018 measured 10-12 bits across 2M browsers. Conservative mid-range.',
    guessed: false,
  },
  'webgl-fingerprinting': {
    vectorId: 'webgl-fingerprinting',
    mode: 'entropy',
    bits: 14,
    bucket: 'rare',
    mitigation:
      'Brave Strict farbles the GPU strings; Firefox-RFP reports a generic vendor; Tor Browser disables WebGL unless enabled.',
    source:
      'Cao 2017 NDSS and Laperdrix 2020: WebGL vendor+renderer = 9-12 bits; shader output adds 5-8 bits more (17-20 bits joint on modern corpora). Conservative mid-range.',
    guessed: false,
  },
  'audio-fingerprinting': {
    vectorId: 'audio-fingerprinting',
    mode: 'entropy',
    bits: 6,
    bucket: 'moderate',
    mitigation:
      'Brave farbles AudioContext; Firefox with privacy.resistFingerprinting adds noise to the DynamicsCompressor output.',
    source:
      'Englehardt & Narayanan 2016 CCS + Laperdrix 2020: 5-7 bits per machine from the DynamicsCompressor sum hash.',
    guessed: false,
  },
  'font-enumeration': {
    vectorId: 'font-enumeration',
    mode: 'entropy',
    bits: 14,
    bucket: 'rare',
    mitigation:
      'Use Tor Browser — it restricts font enumeration to a fixed bundled set everyone in the cohort shares.',
    source:
      'Eckersley 2010 (13.9 bits), Laperdrix 2016 (13.65 bits), Fifield & Egelman 2015 reached 95 percent uniqueness via font metrics alone.',
    guessed: false,
  },
  'timezone-locale': {
    vectorId: 'timezone-locale',
    mode: 'entropy',
    bits: 9,
    bucket: 'moderate',
    mitigation:
      'Tor Browser and Firefox-RFP canonicalise to UTC + en-US. Standard browsers broadcast your actual zone.',
    source:
      'Eckersley 2010 timezone ~3 bits + Laperdrix 2020 navigator.languages ~6 bits, combined under the same card.',
    guessed: false,
  },
  'webgpu-fingerprinting': {
    vectorId: 'webgpu-fingerprinting',
    mode: 'entropy',
    bits: 10,
    bucket: 'rare',
    mitigation:
      "Disable WebGPU in your browser flags (`chrome://flags` → WebGPU), or use Tor Browser — it doesn't ship WebGPU.",
    source:
      'Reasoned estimate: WebGPU adapter info (vendor + architecture + device + description) is structurally similar to WebGL strings but even more detailed; no published 2M-corpus study yet.',
    guessed: true,
  },
  'user-agent-and-client-hints': {
    vectorId: 'user-agent-and-client-hints',
    mode: 'entropy',
    bits: 10,
    bucket: 'moderate',
    mitigation:
      'Pick a browser that lies consistently (Tor, Mullvad) instead of a random UA-spoofer extension that lies uniquely.',
    source:
      'Eckersley 2010 measured 10.0 bits; Laperdrix 2016 confirmed ~10 bits on AmIUnique. Modern UA freezing has lowered this slightly but UA-CH adds it back.',
    guessed: false,
  },
  'navigator-properties': {
    vectorId: 'navigator-properties',
    mode: 'entropy',
    bits: 5,
    bucket: 'moderate',
    mitigation:
      'Use Firefox-RFP or Tor: both flatten platform, hardwareConcurrency, deviceMemory, and maxTouchPoints to fixed values.',
    source:
      'Laperdrix 2016 navigator.platform 2.31 bits + hardwareConcurrency ~2 bits + deviceMemory ~1.5 bits, combined here.',
    guessed: false,
  },
  'screen-viewport': {
    vectorId: 'screen-viewport',
    mode: 'entropy',
    bits: 6,
    bucket: 'moderate',
    mitigation:
      "Tor Browser uses letterboxing to round inner dimensions to 100×100 buckets; Firefox-RFP rounds window size to common presets.",
    source:
      'Eckersley 2010 resolution + depth at 4.83 bits; Gomez-Boix 2018 gets 4-6 bits screen alone, rising to 12+ bits when innerWidth/Height is included.',
    guessed: false,
  },
  'speech-synthesis-voices': {
    vectorId: 'speech-synthesis-voices',
    mode: 'entropy',
    bits: 4,
    bucket: 'moderate',
    mitigation:
      'Firefox-RFP returns a fixed minimal voice list. For other browsers, block speechSynthesis.getVoices() via uBlock Origin scriptlet.',
    source:
      'Acar et al. 2014 listed it as emerging; Laperdrix 2020: 3-5 bits in general populations, higher with installed language packs.',
    guessed: false,
  },
  'media-devices': {
    vectorId: 'media-devices',
    mode: 'entropy',
    bits: 4,
    bucket: 'moderate',
    mitigation:
      'Block enumerateDevices via uBlock Origin, or use Firefox-RFP which returns a normalised short list.',
    source:
      'Englehardt & Narayanan 2016 + Laperdrix 2020: 3-5 bits for device count and kind tuple before any permission prompt.',
    guessed: false,
  },

  // --- sensors ---
  'battery-api': {
    vectorId: 'battery-api',
    mode: 'entropy',
    bits: 3,
    bucket: 'common',
    mitigation:
      'Use Firefox or Safari (the API is gone). Chrome-only: no config — hope the spec gets removed.',
    source:
      'Olejnik et al. 2016 "The leaking battery": ~3 bits per snapshot, higher as a cross-session join over ~30-second windows.',
    guessed: false,
  },

  // --- permissions ---
  'permissions-bitmap': {
    vectorId: 'permissions-bitmap',
    mode: 'entropy',
    bits: 8,
    bucket: 'moderate',
    mitigation:
      'Use a mainstream browser at the latest stable version so your permission shape matches the biggest cohort.',
    source:
      'Reasoned estimate based on 23 permission slots with browser+OS clustering — Laperdrix 2020 mentions 6-10 bits for feature-flag bitmaps.',
    guessed: true,
  },

  // --- storage ---
  'third-party-cookies-storage': {
    vectorId: 'third-party-cookies-storage',
    mode: 'context',
    bits: 0,
    bucket: 'moderate',
    mitigation:
      'Enable Total Cookie Protection (Firefox), Brave Shields, or Safari ITP — all partition third-party storage per eTLD+1.',
    source:
      'Not an entropy signal — this is a capability check for whether trackers can read/write across origins.',
    guessed: false,
  },
  'supercookies-hsts-etag-favicon': {
    vectorId: 'supercookies-hsts-etag-favicon',
    mode: 'context',
    bits: 0,
    bucket: 'moderate',
    mitigation:
      'Browsers fixed most of these in 2020-2023. Use a current stable build of any mainstream browser and HSTS/ETag super-cookies are no longer persistent.',
    source:
      'Not an entropy signal — this is re-identification via persistence. Surface what we observe.',
    guessed: false,
  },

  // --- behavioral ---
  'extension-detection': {
    vectorId: 'extension-detection',
    mode: 'entropy',
    bits: 5,
    bucket: 'moderate',
    mitigation:
      'Use Firefox containers or a separate browser profile for anything you want un-linkable to your extension set.',
    source:
      'Sjosten et al. 2019 "Latex Gloves": per-extension detection via web_accessible_resources yields 2-7 bits depending on how many rare extensions leak.',
    guessed: false,
  },

  // --- cross-site ---
  'referrer-federated-login': {
    vectorId: 'referrer-federated-login',
    mode: 'context',
    bits: 0,
    bucket: 'moderate',
    mitigation:
      'Set Referrer-Policy to "strict-origin-when-cross-origin" in your browser; disable third-party cookies so IdP probes cannot complete.',
    source:
      'Not an entropy signal — referrer leakage and federated-login probes are capability signals, not identity bits.',
    guessed: false,
  },
  'cdn-bot-cookies': {
    vectorId: 'cdn-bot-cookies',
    mode: 'context',
    bits: 0,
    bucket: 'moderate',
    mitigation:
      'Use Firefox with Total Cookie Protection or Brave Shields — both partition `__cf_bm`, `_abck`, and `_px` per eTLD+1 so the cookie cannot follow you cross-site.',
    source:
      'Not an entropy signal — this is cross-site persistence through third-party CDN cookies.',
    guessed: false,
  },
};

/** Lookup helper — returns undefined if the vector has no uniqueness row. */
export function getUniqueness(vectorId: string): VectorUniquenessEntry | undefined {
  return UNIQUENESS_BY_VECTOR[vectorId];
}

/**
 * Convert bits of entropy to a human "1 in N" display number.
 *
 * `bits` is Shannon entropy, so the equivalent uniformly-distributed
 * population is `2 ** bits`. For UI we round and cap: anything below 2 bits
 * is effectively "1 in a few" (not meaningful to call out), and we don't
 * show numbers bigger than 1-in-a-million because the published entropy
 * estimates have more slack than that anyway.
 */
export function bitsToOneInN(bits: number): number {
  if (!Number.isFinite(bits) || bits <= 0) return 1;
  const n = Math.round(2 ** bits);
  return Math.min(n, 1_000_000);
}

/** Short label for the UI pill — "≈1 in 2,048" style. */
export function formatOneInN(bits: number): string {
  const n = bitsToOneInN(bits);
  if (n < 4) return '≈1 in 2';
  return `≈1 in ${n.toLocaleString()}`;
}

/**
 * Assert coverage: every registry id has a uniqueness row. Thrown at
 * test-time so adding a new vector without a row fails loudly.
 */
export function assertUniquenessCoverage(): void {
  const missing: string[] = [];
  for (const v of VECTOR_CATALOG) {
    if (!UNIQUENESS_BY_VECTOR[v.id]) missing.push(v.id);
  }
  if (missing.length > 0) {
    throw new Error(
      `Uniqueness table missing rows for: ${missing.join(', ')}. Add entries in src/lib/scanner/uniqueness.ts.`
    );
  }
}
