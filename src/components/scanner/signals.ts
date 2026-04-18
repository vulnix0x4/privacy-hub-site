/**
 * Build a `DetectionSignals` snapshot from the live browser environment.
 *
 * Runs only in the browser — the Astro page hydrates `ScannerApp` with
 * `client:load`, so every call to this helper happens after `window` exists.
 * We guard each access anyway because both the type checker and Vite's SSR
 * pass will touch this module.
 *
 * `farblingObserved` is detected by reading the canvas hash twice in-session
 * and comparing — if the two reads disagree, something is jittering (Brave
 * standard or strict). The real stability probe inside the runner will
 * re-derive this per-vector; here we just need a hint strong enough to
 * influence `detectBrowser`.
 */
import type { DetectionSignals } from '../../lib/scanner/detectBrowser';
import { probe as canvasProbe } from '../../lib/scanner/probes/canvasFingerprinting';

interface NavigatorWithBrave {
  brave?: { isBrave?: () => Promise<boolean> };
}

interface PermissionLike {
  query: (desc: { name: string }) => Promise<{ state: string }>;
}

async function probePermissionShape(): Promise<Record<string, 'granted' | 'denied' | 'prompt' | 'unsupported'>> {
  const names = [
    'geolocation',
    'notifications',
    'push',
    'camera',
    'microphone',
    'clipboard-read',
    'clipboard-write',
    'persistent-storage',
  ];
  const shape: Record<string, 'granted' | 'denied' | 'prompt' | 'unsupported'> = {};
  const perms = (navigator as Navigator & { permissions?: PermissionLike }).permissions;
  if (!perms || typeof perms.query !== 'function') {
    for (const n of names) shape[n] = 'unsupported';
    return shape;
  }
  for (const name of names) {
    try {
      const res = await perms.query({ name });
      const state = res.state;
      shape[name] =
        state === 'granted' || state === 'denied' || state === 'prompt'
          ? state
          : 'unsupported';
    } catch {
      shape[name] = 'unsupported';
    }
  }
  return shape;
}

async function observeFarbling(): Promise<boolean> {
  // Two quick canvas reads; if they produce different hashes in the same
  // session, something is jittering output. Designed to be cheap enough
  // to run as part of signal collection.
  try {
    const a = await canvasProbe();
    const b = await canvasProbe();
    const ah = readHash(a.value);
    const bh = readHash(b.value);
    if (!ah || !bh) return false;
    return ah !== bh;
  } catch {
    return false;
  }
}

function readHash(v: unknown): string | null {
  if (v && typeof v === 'object' && 'hash' in v && typeof (v as { hash: unknown }).hash === 'string') {
    return (v as { hash: string }).hash;
  }
  return null;
}

async function mediaDevicesEnumerable(): Promise<boolean> {
  try {
    const md = navigator.mediaDevices;
    if (!md || typeof md.enumerateDevices !== 'function') return false;
    const list = await md.enumerateDevices();
    return list.length > 0;
  } catch {
    return false;
  }
}

function webRtcEnabled(): boolean {
  try {
    return 'RTCPeerConnection' in window;
  } catch {
    return false;
  }
}

async function isBrave(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & NavigatorWithBrave;
    const fn = nav.brave?.isBrave;
    if (typeof fn !== 'function') return false;
    const result = await fn.call(nav.brave);
    return result === true;
  } catch {
    return false;
  }
}

function timezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function userAgentData(): DetectionSignals['userAgentData'] {
  const uaData = (navigator as Navigator & {
    userAgentData?: {
      brands: Array<{ brand: string; version: string }>;
      mobile: boolean;
      platform: string;
    };
  }).userAgentData;
  if (!uaData) return undefined;
  return {
    brands: uaData.brands,
    mobile: uaData.mobile,
    platform: uaData.platform,
  };
}

export async function collectSignals(): Promise<DetectionSignals> {
  const permissionShape = await probePermissionShape();
  const [braveFlag, farbling, mdEnum] = await Promise.all([
    isBrave(),
    observeFarbling(),
    mediaDevicesEnumerable(),
  ]);
  const uaData = userAgentData();
  return {
    userAgent: navigator.userAgent,
    ...(uaData !== undefined ? { userAgentData: uaData } : {}),
    permissionShape,
    screenWidth: screen.width,
    screenHeight: screen.height,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    isSecureContext: window.isSecureContext,
    farblingObserved: farbling,
    ...(timezone() !== undefined ? { timezone: timezone() } : {}),
    mediaDevicesEnumerable: mdEnum,
    webRtcEnabled: webRtcEnabled(),
    isBrave: braveFlag,
    // lockdownModeObserved: intentionally undefined — no reliable JS-side signal
  };
}
