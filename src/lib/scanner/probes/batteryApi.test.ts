import { describe, it, expect } from 'vitest';
import { probe } from './batteryApi';

// happy-dom does not implement navigator.getBattery. The probe should return
// { status: 'unsupported' }.
describe('batteryApi probe', () => {
  it('returns an unsupported sentinel or a valid battery object without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('battery-api');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    if (result.error !== undefined) {
      expect(typeof result.error).toBe('string');
      return;
    }
    const value = result.value as Record<string, unknown>;
    const isSentinel = value.status === 'unsupported';
    const hasKeys =
      'level' in value &&
      'charging' in value &&
      'chargingTime' in value &&
      'dischargingTime' in value;
    expect(isSentinel || hasKeys).toBe(true);
  });
});
