/**
 * Lies detection — CreepJS-style cross-checks.
 *
 * The 22 probes collect many overlapping signals. Anti-detect browsers and
 * user-agent spoofers lie about one signal and forget to update the others,
 * which the scanner can catch by comparing. A genuine Chrome-on-Windows
 * install cannot have a WebGL renderer that reports Apple Silicon; a mobile
 * User-Agent with zero touch points is a desktop pretending to be a phone.
 *
 * Design rules:
 *   - **Only flag high-confidence contradictions.** A mobile-UA with 0 touch
 *     points *could* be an iPad in desktop-mode or a tablet with a stylus —
 *     we err toward `suspicious` not `definite-lie` unless multiple signals
 *     agree.
 *   - **Never flag Tor / Mullvad as lying.** Their canonicalisation is the
 *     whole point. Callers pass `browserFamily` so we skip expected mismatches.
 *   - **Inputs are opaque `unknown`.** Probe values may be any shape; we
 *     guard every field access. Missing data → no lie flagged (not a false
 *     positive).
 *
 * @see ./liesDetection.test.ts for the behaviour matrix across spoofer
 * profiles (Chrome-on-Windows UA with Apple WebGL, desktop with mobile UA,
 * etc.).
 */
import type { BrowserFamily } from './types';

export type LieSeverity = 'suspicious' | 'likely-lie' | 'definite-lie';

export interface Lie {
  /** Stable slug for React keys and test assertions. */
  id: string;
  severity: LieSeverity;
  /** One-sentence headline for the UI. */
  headline: string;
  /**
   * Specific evidence that triggered the flag — shown in a <details> panel
   * so power users can verify we're not making things up.
   */
  evidence: string;
  /**
   * Related vector ids — the LiesPanel can deep-link back to the cards.
   */
  relatedVectors: string[];
}

export interface LiesDetectionInput {
  /**
   * `vectorId -> rawValue` map. Values are the `value` field from each
   * probe's last settled `ProbeResult`. Entries may be missing for probes
   * that haven't settled yet; the detector silently skips those rules.
   */
  rawValues: Record<string, unknown>;
  /**
   * Result of the browser detector — used to skip expected-mismatch rules
   * for Tor, Mullvad, and Firefox-RFP. `unknown` is treated as "no family
   * context" and all rules fire.
   */
  browserFamily: BrowserFamily;
}

/**
 * Run every lies-detection rule over the provided probe values. Returns the
 * complete list of triggered lies, in the order they were detected (rules
 * are intentionally ordered by confidence so the highest-severity lies
 * appear first in the UI).
 */
export function detectLies(input: LiesDetectionInput): Lie[] {
  const lies: Lie[] = [];

  // Families that canonicalise signals on purpose — skip everything.
  if (
    input.browserFamily === 'tor-browser' ||
    input.browserFamily === 'mullvad-browser' ||
    input.browserFamily === 'firefox-rfp'
  ) {
    return [];
  }

  const rules: Array<(i: LiesDetectionInput) => Lie | null> = [
    checkUaPlatformVsWebGL,
    checkUaPlatformVsNavigatorPlatform,
    checkUaChBrandsVsUaString,
    checkMobileUaVsTouch,
    checkHardwareConcurrencyAbsurd,
    checkDeviceMemoryNonStandard,
    checkTimezoneVsLocale,
    checkWebdriverFlag,
  ];

  for (const rule of rules) {
    const lie = rule(input);
    if (lie !== null) lies.push(lie);
  }

  return lies;
}

/* ------------------------------------------------------------------ */
/* Rules                                                              */
/* ------------------------------------------------------------------ */

/**
 * UA claims Windows/Linux, WebGL renderer says "Apple" (M1/M2/M3 etc.), or
 * UA claims Mac and WebGL renderer says an Intel/AMD/NVIDIA desktop card.
 * Extremely high confidence — a real machine can't host both.
 */
function checkUaPlatformVsWebGL({ rawValues }: LiesDetectionInput): Lie | null {
  const ua = readString(rawValues['user-agent-and-client-hints'], 'userAgent');
  const webgl = rawValues['webgl-fingerprinting'];
  const renderer =
    readString(webgl, 'unmaskedRenderer') ?? readString(webgl, 'renderer');
  if (!ua || !renderer) return null;

  const uaOs = detectOs(ua);
  const gpuOs = detectGpuPlatform(renderer);
  if (!uaOs || !gpuOs) return null;
  if (uaOs === gpuOs) return null;

  return {
    id: 'ua-vs-webgl-platform',
    severity: 'definite-lie',
    headline: `User-Agent claims ${uaOs}, but the GPU reports ${gpuOs}.`,
    evidence: `UA contains ${quoteSlice(ua, uaOs)}; WebGL renderer is "${renderer}". A real device can only be one of these.`,
    relatedVectors: ['user-agent-and-client-hints', 'webgl-fingerprinting'],
  };
}

/**
 * UA string OS disagrees with navigator.platform. Common when a user
 * installs a UA spoofer that changes the header but not the JS API.
 */
function checkUaPlatformVsNavigatorPlatform({ rawValues }: LiesDetectionInput): Lie | null {
  const ua = readString(rawValues['user-agent-and-client-hints'], 'userAgent');
  const platform = readString(rawValues['navigator-properties'], 'platform');
  if (!ua || !platform) return null;

  const uaOs = detectOs(ua);
  const platformOs = detectPlatformOs(platform);
  if (!uaOs || !platformOs) return null;
  if (uaOs === platformOs) return null;

  return {
    id: 'ua-vs-navigator-platform',
    severity: 'likely-lie',
    headline: `User-Agent says ${uaOs}, navigator.platform says ${platformOs}.`,
    evidence: `UA contains ${quoteSlice(ua, uaOs)}; navigator.platform is "${platform}". UA-spoofer extensions usually change one and forget the other.`,
    relatedVectors: ['user-agent-and-client-hints', 'navigator-properties'],
  };
}

/**
 * UA-CH brands and UA string disagree about which browser is running. Real
 * browsers keep them aligned; anti-detect stacks often forget UA-CH.
 */
function checkUaChBrandsVsUaString({ rawValues }: LiesDetectionInput): Lie | null {
  const ua = readString(rawValues['user-agent-and-client-hints'], 'userAgent');
  const brandsRaw = readPath(rawValues['user-agent-and-client-hints'], [
    'userAgentData',
    'brands',
  ]);
  if (!ua || !Array.isArray(brandsRaw) || brandsRaw.length === 0) return null;

  const brands = brandsRaw
    .map((b) => (b && typeof b === 'object' ? readString(b, 'brand') : null))
    .filter((b): b is string => typeof b === 'string');
  if (brands.length === 0) return null;

  // UA-CH ships with entropy-padding "Not)A;Brand", "Not(A:Brand", etc. We
  // ignore those and focus on the real product brands.
  const realBrands = brands.filter((b) => !/^Not.{1,5}Brand$/.test(b));
  if (realBrands.length === 0) return null;

  const uaSaysChrome = /Chrome\/\d/.test(ua) && !/Chromium\/\d/.test(ua);
  const brandsSayChrome = realBrands.some((b) => /Chrome|Chromium/i.test(b));
  if (uaSaysChrome && !brandsSayChrome) {
    return {
      id: 'ua-vs-uach-brands',
      severity: 'likely-lie',
      headline: 'User-Agent says Chrome, but UA Client Hints list a different brand.',
      evidence: `UA-CH brands: [${realBrands.join(', ')}]. Real Chrome builds always include a Chrome/Chromium brand in UA-CH.`,
      relatedVectors: ['user-agent-and-client-hints'],
    };
  }
  return null;
}

/**
 * UA advertises "Mobile" or "Android" but maxTouchPoints is 0, or UA is
 * clearly desktop but maxTouchPoints is >= 5. Desktop-mode toggles on
 * tablets legitimately produce the first case, so we flag it as suspicious
 * (not definite-lie) unless we also see a mobile UA-CH hint.
 */
function checkMobileUaVsTouch({ rawValues }: LiesDetectionInput): Lie | null {
  const ua = readString(rawValues['user-agent-and-client-hints'], 'userAgent');
  const uaMobile = readBoolean(
    rawValues['user-agent-and-client-hints'],
    'userAgentData',
    'mobile'
  );
  const touchRaw = readPath(rawValues['navigator-properties'], ['maxTouchPoints']);
  const touch = typeof touchRaw === 'number' ? touchRaw : null;
  if (!ua || touch === null) return null;

  const uaIsMobile = /Mobile|Android|iPhone|iPod/.test(ua) || uaMobile === true;
  const uaIsDesktop = /Windows NT|Mac OS X|Linux/.test(ua) && !uaIsMobile;

  if (uaIsMobile && touch === 0) {
    return {
      id: 'mobile-ua-zero-touch',
      severity: uaMobile === true ? 'definite-lie' : 'suspicious',
      headline: 'User-Agent claims mobile, but the device reports zero touch points.',
      evidence: `UA mobile flag = ${uaMobile ?? 'n/a'}; maxTouchPoints = 0. A real phone exposes at least 1 touch point.`,
      relatedVectors: ['user-agent-and-client-hints', 'navigator-properties'],
    };
  }
  if (uaIsDesktop && touch >= 5) {
    // Common legitimate case: touch-screen laptops. Suspicious only.
    return {
      id: 'desktop-ua-many-touch',
      severity: 'suspicious',
      headline: 'Desktop User-Agent with 5+ touch points.',
      evidence: `UA looks desktop; maxTouchPoints = ${touch}. Could be a touch-screen laptop; worth noting either way.`,
      relatedVectors: ['user-agent-and-client-hints', 'navigator-properties'],
    };
  }
  return null;
}

/**
 * navigator.hardwareConcurrency outside [1, 64] is almost certainly spoofed.
 * Real-world CPUs in 2026 max out around 128 on enthusiast hardware; anything
 * above that is suspect.
 */
function checkHardwareConcurrencyAbsurd({ rawValues }: LiesDetectionInput): Lie | null {
  const hc = readPath(rawValues['navigator-properties'], ['hardwareConcurrency']);
  if (typeof hc !== 'number') return null;
  if (!Number.isFinite(hc)) return null;
  if (hc >= 1 && hc <= 128) return null;
  return {
    id: 'hardware-concurrency-absurd',
    severity: 'likely-lie',
    headline: `navigator.hardwareConcurrency reports an implausible value: ${hc}.`,
    evidence: `Real CPUs in 2026 report 1-128; value ${hc} is outside that range and is usually a spoofer.`,
    relatedVectors: ['navigator-properties'],
  };
}

/**
 * navigator.deviceMemory has a spec-mandated quantization to
 * {0.25, 0.5, 1, 2, 4, 8}. Anything else is a spoofer not reading the spec.
 */
function checkDeviceMemoryNonStandard({ rawValues }: LiesDetectionInput): Lie | null {
  const dm = readPath(rawValues['navigator-properties'], ['deviceMemory']);
  if (typeof dm !== 'number') return null;
  const validBuckets = [0.25, 0.5, 1, 2, 4, 8];
  if (validBuckets.includes(dm)) return null;
  return {
    id: 'device-memory-non-standard',
    severity: 'likely-lie',
    headline: `navigator.deviceMemory reports ${dm} GB — outside the spec buckets.`,
    evidence: `Spec quantises to [0.25, 0.5, 1, 2, 4, 8] GB. ${dm} is usually a spoofer writing raw system RAM.`,
    relatedVectors: ['navigator-properties'],
  };
}

/**
 * Timezone "America/Los_Angeles" plus locale "ja-JP" is unusual — real
 * cases exist (diaspora users) but repeated anomalies on a scan are worth
 * surfacing as context. Low severity.
 */
function checkTimezoneVsLocale({ rawValues }: LiesDetectionInput): Lie | null {
  const tz = readString(rawValues['timezone-locale'], 'timezone');
  const locale = readString(rawValues['timezone-locale'], 'locale');
  if (!tz || !locale) return null;
  const tzRegion = tz.split('/')[0];
  const localeRegion = locale.split('-')[1];
  if (!tzRegion || !localeRegion) return null;

  const pairs: Array<{ tz: RegExp; locales: RegExp }> = [
    { tz: /^America/, locales: /^(en|es|pt|fr)/ },
    { tz: /^Europe/, locales: /^(en|de|fr|es|it|pt|nl|pl|ru|uk|sv|no|da|fi|hu|el|cs|ro|bg|hr|sr|sk|sl|et|lv|lt|is|ga|mt)/ },
    { tz: /^Asia/, locales: /^(ja|ko|zh|hi|th|vi|id|ms|tl|bn|ur|fa|ar|he|tr|ka|hy|uz|kk|ky|tg|mn|si|ta|te|ml|kn|mr|gu|pa|ne|my)/ },
    { tz: /^Africa/, locales: /^(ar|en|fr|pt|sw|am|ha|yo|ig|zu|xh|af)/ },
    { tz: /^Australia/, locales: /^en/ },
    { tz: /^Pacific/, locales: /^en/ },
  ];

  const match = pairs.find((p) => p.tz.test(tz));
  if (!match) return null;
  const langTag = locale.split('-')[0]?.toLowerCase();
  if (!langTag) return null;
  if (match.locales.test(langTag)) return null;

  return {
    id: 'timezone-vs-locale-region',
    severity: 'suspicious',
    headline: `Timezone ${tz} with locale ${locale} is unusual.`,
    evidence: `These rarely co-occur — could be a diaspora user or a VPN + locale mismatch. Noted for transparency, not scored as a lie.`,
    relatedVectors: ['timezone-locale'],
  };
}

/**
 * navigator.webdriver === true means an automation framework (Selenium,
 * Playwright, Puppeteer) is piloting the browser. Not necessarily malicious
 * but almost never a human visitor.
 */
function checkWebdriverFlag({ rawValues }: LiesDetectionInput): Lie | null {
  const wd = readPath(rawValues['navigator-properties'], ['webdriver']);
  if (wd !== true) return null;
  return {
    id: 'webdriver-flag-set',
    severity: 'definite-lie',
    headline: 'navigator.webdriver is true — this session is being automated.',
    evidence:
      'Selenium, Playwright, and Puppeteer all set this flag. If you see it and you are not running a test, something else on your machine is driving your browser.',
    relatedVectors: ['navigator-properties'],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

type Os = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | 'ChromeOS';

function detectOs(ua: string): Os | null {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return null;
}

function detectPlatformOs(platform: string): Os | null {
  if (/^Win/i.test(platform)) return 'Windows';
  if (/^Mac/i.test(platform)) return 'macOS';
  if (/^Linux/i.test(platform)) return 'Linux';
  if (/Android/i.test(platform)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(platform)) return 'iOS';
  return null;
}

/**
 * Best-effort GPU platform detection from the WebGL renderer string.
 * Apple Silicon, Intel/AMD/NVIDIA desktop cards, Mali/Adreno/PowerVR mobile
 * cores map to their host OS. We only return a value when we're confident.
 */
function detectGpuPlatform(renderer: string): Os | null {
  if (/\bApple\b.*\b(M[0-9]|GPU)/i.test(renderer)) return 'macOS';
  if (/\bApple A[0-9]+/i.test(renderer)) return 'iOS';
  if (/Mali-|Adreno|PowerVR/i.test(renderer)) return 'Android';
  // Windows / Linux desktops commonly see NVIDIA, AMD, Intel — can't split
  // by GPU alone, so return null (no confident lie).
  return null;
}

function readString(v: unknown, ...path: string[]): string | null {
  const r = readPath(v, path);
  return typeof r === 'string' && r.length > 0 ? r : null;
}

function readBoolean(v: unknown, ...path: string[]): boolean | null {
  const r = readPath(v, path);
  return typeof r === 'boolean' ? r : null;
}

function readPath(v: unknown, path: string[]): unknown {
  let cur: unknown = v;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function quoteSlice(ua: string, os: Os): string {
  const patterns: Record<Os, RegExp> = {
    Windows: /Windows NT [0-9.]+/,
    macOS: /Mac OS X [0-9_]+/,
    Linux: /Linux[^;)]*/,
    Android: /Android[^;)]*/,
    iOS: /(iPhone|iPad|iPod)[^;)]*/,
    ChromeOS: /CrOS[^;)]*/,
  };
  const m = ua.match(patterns[os]);
  return m ? `"${m[0]}"` : `${os}`;
}
