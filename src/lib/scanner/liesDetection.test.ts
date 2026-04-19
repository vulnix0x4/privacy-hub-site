import { describe, it, expect } from 'vitest';
import { detectLies } from './liesDetection';

/**
 * Shorthand: build a rawValues map with only the fields we care about for
 * each test case. Unspecified probes return undefined and the rule skips.
 */
function raw(overrides: Record<string, unknown>): Record<string, unknown> {
  return overrides;
}

describe('detectLies', () => {
  describe('UA vs WebGL GPU platform', () => {
    it('flags a definite lie when UA says Windows but WebGL says Apple Silicon', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            userAgentData: { brands: [{ brand: 'Chromium', version: '128' }], mobile: false, platform: 'Windows' },
          },
          'webgl-fingerprinting': {
            unmaskedRenderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
            renderer: 'WebKit WebGL',
          },
        }),
      });
      const lie = lies.find((l) => l.id === 'ua-vs-webgl-platform');
      expect(lie).toBeDefined();
      expect(lie?.severity).toBe('definite-lie');
    });

    it('does not flag when UA and GPU agree', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          },
          'webgl-fingerprinting': {
            unmaskedRenderer: 'Apple M2 Pro',
          },
        }),
      });
      const lie = lies.find((l) => l.id === 'ua-vs-webgl-platform');
      expect(lie).toBeUndefined();
    });

    it('does not flag when the GPU string is generic (Intel/NVIDIA/AMD)', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
          },
          'webgl-fingerprinting': {
            unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)',
          },
        }),
      });
      const lie = lies.find((l) => l.id === 'ua-vs-webgl-platform');
      expect(lie).toBeUndefined();
    });
  });

  describe('UA vs navigator.platform', () => {
    it('flags likely-lie when UA says Windows but platform is MacIntel', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
          },
          'navigator-properties': { platform: 'MacIntel' },
        }),
      });
      const lie = lies.find((l) => l.id === 'ua-vs-navigator-platform');
      expect(lie).toBeDefined();
      expect(lie?.severity).toBe('likely-lie');
    });

    it('does not flag when UA and platform agree', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
          },
          'navigator-properties': { platform: 'Win32' },
        }),
      });
      expect(lies.find((l) => l.id === 'ua-vs-navigator-platform')).toBeUndefined();
    });
  });

  describe('UA-CH brands vs UA string', () => {
    it('flags when UA says Chrome but UA-CH brands list no Chromium brand', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/128.0.0.0 Safari/537.36',
            userAgentData: {
              brands: [
                { brand: 'Not(A:Brand', version: '99' },
                { brand: 'Brave', version: '1.60' },
              ],
            },
          },
        }),
      });
      expect(lies.find((l) => l.id === 'ua-vs-uach-brands')).toBeDefined();
    });

    it('does not flag genuine Chrome with matching UA-CH brands', () => {
      const lies = detectLies({
        browserFamily: 'vanilla-chrome',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
            userAgentData: {
              brands: [
                { brand: 'Not)A;Brand', version: '99' },
                { brand: 'Google Chrome', version: '128' },
                { brand: 'Chromium', version: '128' },
              ],
            },
          },
        }),
      });
      expect(lies.find((l) => l.id === 'ua-vs-uach-brands')).toBeUndefined();
    });
  });

  describe('mobile UA vs touch points', () => {
    it('flags a definite lie when UA-CH.mobile=true but touch=0', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128.0.0.0 Mobile Safari/537.36',
            userAgentData: { mobile: true, brands: [{ brand: 'Chromium', version: '128' }] },
          },
          'navigator-properties': { maxTouchPoints: 0 },
        }),
      });
      const lie = lies.find((l) => l.id === 'mobile-ua-zero-touch');
      expect(lie).toBeDefined();
      expect(lie?.severity).toBe('definite-lie');
    });

    it('flags suspicious on desktop UA with 10 touch points', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({
          'user-agent-and-client-hints': {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
          },
          'navigator-properties': { maxTouchPoints: 10 },
        }),
      });
      const lie = lies.find((l) => l.id === 'desktop-ua-many-touch');
      expect(lie).toBeDefined();
      expect(lie?.severity).toBe('suspicious');
    });
  });

  describe('absurd hardware concurrency', () => {
    it('flags navigator.hardwareConcurrency of 256', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({ 'navigator-properties': { hardwareConcurrency: 256 } }),
      });
      expect(lies.find((l) => l.id === 'hardware-concurrency-absurd')).toBeDefined();
    });

    it('does not flag 8, 16, 32 cores', () => {
      for (const hc of [8, 16, 32]) {
        const lies = detectLies({
          browserFamily: 'unknown',
          rawValues: raw({ 'navigator-properties': { hardwareConcurrency: hc } }),
        });
        expect(lies.find((l) => l.id === 'hardware-concurrency-absurd')).toBeUndefined();
      }
    });
  });

  describe('non-standard deviceMemory', () => {
    it('flags 16 GB (outside spec buckets)', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({ 'navigator-properties': { deviceMemory: 16 } }),
      });
      expect(lies.find((l) => l.id === 'device-memory-non-standard')).toBeDefined();
    });

    it('does not flag the spec buckets', () => {
      for (const dm of [0.25, 0.5, 1, 2, 4, 8]) {
        const lies = detectLies({
          browserFamily: 'unknown',
          rawValues: raw({ 'navigator-properties': { deviceMemory: dm } }),
        });
        expect(lies.find((l) => l.id === 'device-memory-non-standard')).toBeUndefined();
      }
    });
  });

  describe('webdriver flag', () => {
    it('flags navigator.webdriver=true', () => {
      const lies = detectLies({
        browserFamily: 'unknown',
        rawValues: raw({ 'navigator-properties': { webdriver: true } }),
      });
      expect(lies.find((l) => l.id === 'webdriver-flag-set')?.severity).toBe('definite-lie');
    });
  });

  describe('Tor / Mullvad / Firefox-RFP skip', () => {
    it('returns an empty array for Tor Browser no matter what', () => {
      expect(
        detectLies({
          browserFamily: 'tor-browser',
          rawValues: raw({ 'navigator-properties': { webdriver: true } }),
        })
      ).toEqual([]);
    });

    it('returns an empty array for Mullvad Browser', () => {
      expect(
        detectLies({
          browserFamily: 'mullvad-browser',
          rawValues: raw({ 'navigator-properties': { webdriver: true, deviceMemory: 7 } }),
        })
      ).toEqual([]);
    });

    it('returns an empty array for Firefox with RFP', () => {
      expect(
        detectLies({
          browserFamily: 'firefox-rfp',
          rawValues: raw({ 'navigator-properties': { hardwareConcurrency: 2 } }),
        })
      ).toEqual([]);
    });
  });

  describe('empty input', () => {
    it('returns an empty array when no rawValues are provided', () => {
      expect(
        detectLies({ browserFamily: 'unknown', rawValues: {} })
      ).toEqual([]);
    });
  });
});
