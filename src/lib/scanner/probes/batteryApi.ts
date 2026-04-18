/**
 * Vector probe: `battery-api`
 *
 * Chrome desktop still exposes `navigator.getBattery()`. The discharge
 * curve plus charging state are sufficiently unique that they can
 * re-link a session across cookie clears within a few minutes.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'battery-api';

interface BatteryManager {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}
interface NavigatorWithBattery {
  getBattery?: () => Promise<BatteryManager>;
}

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as NavigatorWithBattery)
        : undefined;
    if (!nav?.getBattery) {
      return done(start, { status: 'unsupported' });
    }
    const battery = await nav.getBattery();
    const value = {
      level: battery.level,
      charging: battery.charging,
      chargingTime: battery.chargingTime,
      dischargingTime: battery.dischargingTime,
    };
    return done(start, value);
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
