/**
 * Vector probe: `media-devices`
 *
 * Calls `navigator.mediaDevices.enumerateDevices()` without asking for
 * gUM permission. Labels and device IDs are empty/obfuscated without a
 * grant, but the `kind` counts still reveal how much audio/video hardware
 * the device has attached.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'media-devices';

interface DeviceShape {
  kind: string;
  label: string;
  deviceId: string;
  groupId: string;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const md =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { mediaDevices?: MediaDevices })
            .mediaDevices
        : undefined;
    if (!md || typeof md.enumerateDevices !== 'function') {
      return done(start, {
        devices: [],
        counts: { audioinput: 0, audiooutput: 0, videoinput: 0 },
        status: 'unsupported',
      });
    }
    const list = await md.enumerateDevices();
    const devices: DeviceShape[] = list.map((d) => ({
      kind: d.kind,
      label: d.label,
      deviceId: d.deviceId,
      groupId: d.groupId,
    }));
    const counts = {
      audioinput: devices.filter((d) => d.kind === 'audioinput').length,
      audiooutput: devices.filter((d) => d.kind === 'audiooutput').length,
      videoinput: devices.filter((d) => d.kind === 'videoinput').length,
    };
    return done(start, { devices, counts });
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
