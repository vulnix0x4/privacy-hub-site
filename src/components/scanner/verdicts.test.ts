import { describe, it, expect } from 'vitest';
import { VERDICT_BY_BROWSER } from './verdicts';
import type { BrowserFamily } from '../../lib/scanner/types';

/**
 * Every `BrowserFamily` value must have a verdict entry. If a new family is
 * added to `types.ts`, TS won't catch a missing key here because
 * `VERDICT_BY_BROWSER` is `Record<BrowserFamily, ...>` and the compiler trusts
 * our declaration — this test is the runtime guard.
 */
const ALL_FAMILIES: BrowserFamily[] = [
  'vanilla-chrome',
  'edge',
  'brave-standard',
  'brave-strict',
  'firefox-etp-standard',
  'firefox-etp-strict',
  'firefox-rfp',
  'librewolf',
  'safari',
  'safari-lockdown',
  'tor-browser',
  'mullvad-browser',
  'unknown',
];

describe('VERDICT_BY_BROWSER', () => {
  it('has exactly 13 entries — one per BrowserFamily value', () => {
    expect(Object.keys(VERDICT_BY_BROWSER)).toHaveLength(ALL_FAMILIES.length);
    expect(ALL_FAMILIES).toHaveLength(13);
  });

  it('has an entry for every BrowserFamily value', () => {
    for (const family of ALL_FAMILIES) {
      expect(VERDICT_BY_BROWSER[family]).toBeDefined();
    }
  });

  it('every entry has a non-empty headline and detail', () => {
    for (const family of ALL_FAMILIES) {
      const entry = VERDICT_BY_BROWSER[family];
      expect(typeof entry.headline).toBe('string');
      expect(entry.headline.length).toBeGreaterThan(0);
      expect(typeof entry.detail).toBe('string');
      expect(entry.detail.length).toBeGreaterThan(0);
    }
  });
});
