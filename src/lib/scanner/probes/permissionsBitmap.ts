/**
 * Vector probe: `permissions-bitmap`
 *
 * Queries the Permissions API for a fixed list of 23 permission names and
 * records either the state (`granted` / `denied` / `prompt`) or the
 * `'unsupported'` sentinel when the browser rejects the name.
 *
 * The shape — which names the browser recognises, and the mix of
 * granted/prompt/denied — is itself a fingerprint. The count of
 * recognised names differs between Chromium, Firefox, and Safari; the
 * granted/denied profile differs between users.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'permissions-bitmap';

export const PERMISSION_NAMES = [
  'geolocation',
  'notifications',
  'push',
  'midi',
  'camera',
  'microphone',
  'background-fetch',
  'background-sync',
  'persistent-storage',
  'ambient-light-sensor',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'screen-wake-lock',
  'nfc',
  'display-capture',
  'accessibility-events',
  'clipboard-read',
  'clipboard-write',
  'payment-handler',
  'idle-detection',
  'periodic-background-sync',
  'system-wake-lock',
] as const;

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

interface PermissionsLike {
  query: (desc: { name: string }) => Promise<{ state: string }>;
}
interface NavigatorWithPermissions {
  permissions?: PermissionsLike;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const perms =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as NavigatorWithPermissions).permissions
        : undefined;
    if (!perms || typeof perms.query !== 'function') {
      const shape = Object.fromEntries(
        PERMISSION_NAMES.map((n) => [n, 'unsupported' as PermissionState])
      );
      return done(start, { shape });
    }

    const shape: Record<string, PermissionState> = {};
    for (const name of PERMISSION_NAMES) {
      try {
        const result = await perms.query({ name });
        const state = result.state as PermissionState;
        shape[name] = (state === 'granted' || state === 'denied' || state === 'prompt')
          ? state
          : 'unsupported';
      } catch {
        shape[name] = 'unsupported';
      }
    }
    return done(start, { shape });
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
  }
}

function done(start: number, value: unknown): ProbeResult {
  return {
    vectorId: VECTOR_ID,
    value,
    durationMs: Math.max(0, now() - start),
  };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
