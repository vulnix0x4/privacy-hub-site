import { describe, it, expect } from 'vitest';
import { probe } from './timezoneLocale';

describe('timezoneLocale probe', () => {
  it('returns timezone + locale + calendar + numbering system', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('timezone-locale');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as {
      timezone: string;
      locale: string;
      calendar: string;
      numberingSystem: string;
    };
    expect(typeof value.timezone).toBe('string');
    expect(typeof value.locale).toBe('string');
    expect(typeof value.calendar).toBe('string');
    expect(typeof value.numberingSystem).toBe('string');
  });
});
