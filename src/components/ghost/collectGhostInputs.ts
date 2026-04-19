/**
 * Gather the six Ghost-hash inputs from the live browser.
 *
 * Intentionally self-contained: we don't drag the full scanner registry or
 * `stabilityProbe` in here. The Ghost Demo only needs one-shot reads of the
 * canvas, audio, UA, screen, timezone, and a short font list. That keeps
 * the island small and makes the code easy to reason about.
 *
 * Every helper is wrapped in try/catch: a missing API (Tor, Lockdown Mode,
 * private mode) should yield an empty-string placeholder rather than an
 * unhandled rejection. The hash just reflects whatever we could read.
 */
import type { GhostHashInputs, ResilientHashInputs } from './computeGhostHash';
import type { DetectionSignals } from '../../lib/scanner/detectBrowser';

interface NavigatorWithBrave {
  brave?: { isBrave?: () => Promise<boolean> };
}

/**
 * Run a 220x30 canvas rasterisation and return its SHA-256 hex.
 *
 * Mirrors the shape of the scanner's canvas probe but is simplified: we
 * don't care about error differentiation, just a hash-or-empty result.
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
    return await sha256Hex(canvas.toDataURL('image/png'));
  } catch {
    return '';
  }
}

/**
 * Render 1s of a compressed oscillator into an OfflineAudioContext and hash
 * the mid-slice sum. Identical method to the scanner's audio probe.
 */
async function hashAudio(): Promise<string> {
  try {
    const OAC =
      (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
        .OfflineAudioContext ??
      (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OAC) return '';
    const ctx = new OAC(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10_000;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;
    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);
    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const sliceEnd = Math.min(data.length, 45_000);
    const sliceStart = Math.max(0, sliceEnd - 1000);
    let acc = 0;
    for (let i = sliceStart; i < sliceEnd; i++) {
      acc += Math.abs(data[i] ?? 0);
    }
    return await sha256Hex(acc.toFixed(6));
  } catch {
    return '';
  }
}

/** Same short allow-list the scanner uses, capped to the 30 design-doc specifies. */
const CANDIDATE_FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Comic Sans MS',
  'Trebuchet MS',
  'Arial Black',
  'Impact',
  'Tahoma',
  'Palatino',
  'Garamond',
  'Bookman',
  'Avant Garde',
  'Andale Mono',
  'Calibri',
  'Cambria',
  'Consolas',
  'Segoe UI',
  'Optima',
  'Futura',
  'Geneva',
  'Lucida Console',
  'Lucida Sans',
  'Monaco',
  'Helvetica Neue',
  'San Francisco',
  'SF Pro',
  'Inter',
] as const;

const BASELINE_FONTS = ['monospace', 'sans-serif', 'serif'] as const;

/**
 * Simplified font-enumeration. Detects installed fonts by measuring text-width
 * deltas against three fallback families. Returns the raw names — the hash
 * module sorts + caps to 30.
 */
function detectFonts(): string[] {
  if (typeof document === 'undefined' || !document.body) return [];
  try {
    const span = document.createElement('span');
    span.textContent = 'mmmmmmmmmmlli';
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.top = '-9999px';
    span.style.fontSize = '72px';
    span.style.visibility = 'hidden';
    document.body.appendChild(span);
    try {
      const baselineWidths: Record<string, number> = {};
      for (const base of BASELINE_FONTS) {
        span.style.fontFamily = base;
        baselineWidths[base] = span.getBoundingClientRect().width;
      }
      const installed: string[] = [];
      for (const font of CANDIDATE_FONTS) {
        for (const base of BASELINE_FONTS) {
          span.style.fontFamily = `"${font}", ${base}`;
          const w = span.getBoundingClientRect().width;
          if (w !== baselineWidths[base]) {
            installed.push(font);
            break;
          }
        }
      }
      return installed;
    } finally {
      try {
        document.body.removeChild(span);
      } catch {
        // ignore teardown race
      }
    }
  } catch {
    return [];
  }
}

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Assemble the six-field input vector for {@link computeGhostHash}. */
export async function collectGhostInputs(): Promise<GhostHashInputs> {
  const [canvas, audio] = await Promise.all([hashCanvas(), hashAudio()]);
  const fonts = detectFonts();
  return {
    canvas,
    audio,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    screen: [
      typeof screen !== 'undefined' ? screen.width : 0,
      typeof screen !== 'undefined' ? screen.height : 0,
      typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1,
    ] as [number, number, number],
    timezone: timezone(),
    fonts,
  };
}

/**
 * Gather the four resilient signals that survive Brave's per-session farbling:
 * timezone, primary language, OS platform, and screen dimensions. No network
 * fetch — all pure client-side reads.
 */
export function collectResilientInputs(): ResilientHashInputs {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  return {
    timezone: timezone(),
    language: typeof nav.language === 'string' ? nav.language : '',
    platform: typeof nav.platform === 'string' ? nav.platform : '',
    screen: [
      typeof screen !== 'undefined' ? screen.width : 0,
      typeof screen !== 'undefined' ? screen.height : 0,
    ] as [number, number],
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

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return ('fallback' + (h >>> 0).toString(16)).padEnd(64, '0');
}
