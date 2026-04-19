/**
 * Gather the Ghost-hash inputs from the live browser.
 *
 * Every helper is wrapped in try/catch: a missing API (Tor, Lockdown Mode,
 * private mode, restrictive policy) should yield a sane default rather than
 * an unhandled rejection. The hash just reflects whatever we could read.
 *
 * Every collected signal is deliberately chosen to survive Brave's per-
 * session farbling (canvas / audio / fonts / UA minor version / hardware
 * concurrency / device memory) and to remain stable across private-window
 * boundaries on the same device.
 */
import type { GhostHashInputs } from './computeGhostHash';
import type { DetectionSignals } from '../../lib/scanner/detectBrowser';

interface NavigatorWithBrave {
  brave?: { isBrave?: () => Promise<boolean> };
}

interface NavigatorUAData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
}

/**
 * The ordered list of feature-detection probes that feed the `features`
 * bitmap. Bit N is set if the corresponding check returns truthy. Order
 * must stay frozen — changing it changes every existing user's hash.
 */
const FEATURE_PROBES: ReadonlyArray<{ name: string; check: () => boolean }> = [
  { name: 'serviceWorker', check: () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator },
  { name: 'indexedDB', check: () => typeof indexedDB !== 'undefined' },
  {
    name: 'webGL',
    check: () => {
      try {
        if (typeof document === 'undefined') return false;
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
      } catch {
        return false;
      }
    },
  },
  { name: 'webGPU', check: () => typeof navigator !== 'undefined' && 'gpu' in navigator },
  {
    name: 'audioContext',
    check: () =>
      typeof globalThis !== 'undefined' &&
      (typeof (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext !==
        'undefined' ||
        typeof (globalThis as { webkitOfflineAudioContext?: unknown })
          .webkitOfflineAudioContext !== 'undefined'),
  },
  {
    name: 'speechSynthesis',
    check: () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  },
  { name: 'bluetooth', check: () => typeof navigator !== 'undefined' && 'bluetooth' in navigator },
  {
    name: 'gamepad',
    check: () => typeof navigator !== 'undefined' && 'getGamepads' in navigator,
  },
  {
    name: 'wakeLock',
    check: () => typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  },
  { name: 'share', check: () => typeof navigator !== 'undefined' && 'share' in navigator },
  {
    name: 'clipboard',
    check: () => typeof navigator !== 'undefined' && 'clipboard' in navigator,
  },
  {
    name: 'geolocation',
    check: () => typeof navigator !== 'undefined' && 'geolocation' in navigator,
  },
  {
    name: 'deviceOrientation',
    check: () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
  },
  {
    name: 'webCrypto',
    check: () =>
      typeof globalThis !== 'undefined' && !!globalThis.crypto && !!globalThis.crypto.subtle,
  },
  {
    name: 'credentials',
    check: () => typeof navigator !== 'undefined' && 'credentials' in navigator,
  },
  { name: 'usb', check: () => typeof navigator !== 'undefined' && 'usb' in navigator },
  { name: 'serial', check: () => typeof navigator !== 'undefined' && 'serial' in navigator },
  { name: 'hid', check: () => typeof navigator !== 'undefined' && 'hid' in navigator },
  {
    name: 'pushManager',
    check: () => typeof window !== 'undefined' && 'PushManager' in window,
  },
  {
    name: 'payment',
    check: () => typeof window !== 'undefined' && 'PaymentRequest' in window,
  },
] as const;

export const FEATURE_NAMES: readonly string[] = FEATURE_PROBES.map((p) => p.name);

function computeFeatureBitmap(): number {
  let b = 0;
  for (let i = 0; i < FEATURE_PROBES.length; i++) {
    try {
      if (FEATURE_PROBES[i]!.check()) b |= 1 << i;
    } catch {
      // leave bit unset on any throw
    }
  }
  return b;
}

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

function timezoneOffset(): number {
  try {
    return new Date().getTimezoneOffset();
  } catch {
    return 0;
  }
}

function uaBrand(ua: string, uaData: NavigatorUAData | undefined): string {
  // Prefer UA-CH brands where available (non-Blink browsers typically lack
  // this; that's fine — we fall through to UA regex).
  const brands = uaData?.brands ?? [];
  for (const b of brands) {
    // Skip the "Not*A*Brand" / GREASE entries.
    if (/not.*brand/i.test(b.brand)) continue;
    if (/chromium/i.test(b.brand)) continue; // prefer derivative brand over Chromium
    return b.brand;
  }
  if (/LibreWolf/i.test(ua)) return 'LibreWolf';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua) && !/Chrome|Chromium/.test(ua)) return 'Safari';
  if (/Chrome/.test(ua)) return 'Chrome';
  return 'unknown';
}

function uaMobile(ua: string, uaData: NavigatorUAData | undefined): boolean {
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  return /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
}

function mediaPref(query: string, candidates: readonly string[]): string {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return 'no-preference';
    for (const candidate of candidates) {
      if (window.matchMedia(`(${query}: ${candidate})`).matches) return candidate;
    }
    return 'no-preference';
  } catch {
    return 'no-preference';
  }
}

/** Assemble the input vector for {@link computeGhostHash}. */
export function collectGhostInputs(): GhostHashInputs {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  const uaData = (nav as unknown as { userAgentData?: NavigatorUAData }).userAgentData;
  const languages = Array.isArray(nav.languages) ? [...nav.languages] : [];
  const primaryLang = typeof nav.language === 'string' ? nav.language : '';
  const sc = typeof screen !== 'undefined' ? screen : ({} as Screen);
  return {
    timezone: timezone(),
    timezoneOffset: timezoneOffset(),
    language: primaryLang,
    languages: languages.length > 0 ? languages : primaryLang ? [primaryLang] : [],
    platform: typeof nav.platform === 'string' ? nav.platform : '',
    uaBrand: uaBrand(ua, uaData),
    uaMobile: uaMobile(ua, uaData),
    screen: [
      typeof sc.width === 'number' ? sc.width : 0,
      typeof sc.height === 'number' ? sc.height : 0,
    ] as [number, number],
    colorDepth: typeof sc.colorDepth === 'number' ? sc.colorDepth : 0,
    pixelDepth: typeof sc.pixelDepth === 'number' ? sc.pixelDepth : 0,
    maxTouchPoints: typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
    cookieEnabled: typeof nav.cookieEnabled === 'boolean' ? nav.cookieEnabled : false,
    prefersColorScheme: mediaPref('prefers-color-scheme', ['dark', 'light']),
    prefersReducedMotion: mediaPref('prefers-reduced-motion', ['reduce']),
    prefersContrast: mediaPref('prefers-contrast', ['more', 'less', 'custom']),
    features: computeFeatureBitmap(),
  };
}

/**
 * Build just enough `DetectionSignals` to call `detectBrowser` from inside
 * the Ghost Demo without pulling in the scanner's full collector. Observing
 * farbling (two-read canvas diff) matters for Brave-strict vs -standard
 * classification, so we do that cheaply right here.
 */
export async function collectDetectionSignals(): Promise<DetectionSignals> {
  let farblingObserved = false;
  try {
    const a = await hashCanvas();
    const b = await hashCanvas();
    if (a && b && a !== b) farblingObserved = true;
  } catch {
    // leave `farblingObserved` false
  }

  let isBrave = false;
  try {
    const nav = navigator as Navigator & NavigatorWithBrave;
    const fn = nav.brave?.isBrave;
    if (typeof fn === 'function') {
      isBrave = (await fn.call(nav.brave)) === true;
    }
  } catch {
    isBrave = false;
  }

  let mediaDevicesEnumerable = false;
  try {
    const md = navigator.mediaDevices;
    if (md && typeof md.enumerateDevices === 'function') {
      const list = await md.enumerateDevices();
      mediaDevicesEnumerable = list.length > 0;
    }
  } catch {
    mediaDevicesEnumerable = false;
  }

  let webRtcEnabled = false;
  try {
    webRtcEnabled = 'RTCPeerConnection' in window;
  } catch {
    webRtcEnabled = false;
  }

  return {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    permissionShape: {},
    screenWidth: typeof screen !== 'undefined' ? screen.width : 0,
    screenHeight: typeof screen !== 'undefined' ? screen.height : 0,
    innerWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    innerHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    farblingObserved,
    timezone: timezone() || undefined,
    mediaDevicesEnumerable,
    webRtcEnabled,
    isBrave,
  };
}

/**
 * Render a 220x30 canvas fingerprint and hash it. Used only by
 * {@link collectDetectionSignals} to detect Brave's farbling by diffing two
 * reads — not part of the Ghost hash itself (Brave would drift the hash).
 */
async function hashCanvas(): Promise<string> {
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('ghost \u{1F47B}', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('ghost \u{1F47B}', 4, 17);
    const url = canvas.toDataURL('image/png');
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return url.slice(-32);
    const buf = new TextEncoder().encode(url);
    const digest = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}
