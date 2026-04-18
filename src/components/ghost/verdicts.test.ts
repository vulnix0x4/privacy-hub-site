import { describe, it, expect } from 'vitest';
import {
  getVerdict,
  isAnonymityBucket,
  ALL_FAMILIES,
  ALL_OUTCOMES,
} from './verdicts';

describe('verdicts', () => {
  it('every (family × outcome) combination returns a non-empty headline and detail', () => {
    for (const family of ALL_FAMILIES) {
      for (const outcome of ALL_OUTCOMES) {
        const v = getVerdict(family, outcome);
        expect(v.headline.length, `headline for ${family}/${outcome}`).toBeGreaterThan(0);
        expect(v.detail.length, `detail for ${family}/${outcome}`).toBeGreaterThan(0);
        expect(['red', 'green', 'neutral']).toContain(v.tone);
      }
    }
  });

  it('Tor and Mullvad persistent verdicts frame the result as joining an anonymity set', () => {
    expect(getVerdict('tor-browser', 'persistent').headline).toMatch(/anonymity set/i);
    expect(getVerdict('mullvad-browser', 'persistent').headline).toMatch(/anonymity set/i);
  });

  it('Brave-strict drift celebrates farbling', () => {
    const v = getVerdict('brave-strict', 'drift');
    expect(v.headline).toMatch(/Brave/i);
    expect(v.tone).toBe('green');
  });

  it('vanilla Chrome persistent verdict points to the full scanner', () => {
    const v = getVerdict('vanilla-chrome', 'persistent');
    expect(v.tone).toBe('red');
    expect(v.detail.toLowerCase()).toContain('scanner');
  });

  it('`isAnonymityBucket` accepts only Tor/Mullvad/Brave-strict', () => {
    expect(isAnonymityBucket('tor-browser')).toBe(true);
    expect(isAnonymityBucket('mullvad-browser')).toBe(true);
    expect(isAnonymityBucket('brave-strict')).toBe(true);
    expect(isAnonymityBucket('vanilla-chrome')).toBe(false);
    expect(isAnonymityBucket('firefox-etp-standard')).toBe(false);
    expect(isAnonymityBucket('safari')).toBe(false);
  });

  it('anonymity-set outcome falls back to drift copy for non-anonymity families', () => {
    // Caller mistake: asking for anonymity framing when the family is not in
    // the set. We prefer returning the drift copy over throwing.
    const v = getVerdict('vanilla-chrome', 'anonymity-set');
    expect(v.headline).toBe(getVerdict('vanilla-chrome', 'drift').headline);
  });

  it('first-visit verdict mentions local/IndexedDB framing for vanilla Chrome', () => {
    const v = getVerdict('vanilla-chrome', 'first-visit');
    expect(v.detail.toLowerCase()).toContain('indexeddb');
  });

  it('first-visit verdict for Tor mentions the anonymity-set framing', () => {
    const v = getVerdict('tor-browser', 'first-visit');
    expect(v.headline.toLowerCase()).toMatch(/tor|every other/);
  });
});
