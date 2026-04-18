import { describe, it, expect } from 'vitest';
import { probe } from './navigatorProperties';

const EXPECTED_KEYS = [
  'platform',
  'language',
  'languages',
  'hardwareConcurrency',
  'deviceMemory',
  'maxTouchPoints',
  'vendor',
  'cookieEnabled',
  'doNotTrack',
  'pdfViewerEnabled',
  'webdriver',
  'oscpu',
];

describe('navigatorProperties probe', () => {
  it('returns all twelve navigator keys', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('navigator-properties');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as Record<string, unknown>;
    for (const key of EXPECTED_KEYS) {
      expect(key in value).toBe(true);
    }
  });
});
