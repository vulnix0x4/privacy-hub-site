import { describe, it, expect } from 'vitest';
import { detectBrowser } from './detectBrowser';
import type { DetectionSignals } from './detectBrowser';
import type { BrowserFamily } from './types';

/** Realistic-enough PermissionState map for the tests. */
const DEFAULT_PERMS: DetectionSignals['permissionShape'] = {
  geolocation: 'prompt',
  notifications: 'prompt',
  camera: 'prompt',
  microphone: 'prompt',
  clipboard: 'prompt',
};

function base(overrides: Partial<DetectionSignals>): DetectionSignals {
  return {
    userAgent: 'Mozilla/5.0',
    permissionShape: { ...DEFAULT_PERMS },
    screenWidth: 1920,
    screenHeight: 1080,
    innerWidth: 1920,
    innerHeight: 1080,
    isSecureContext: true,
    ...overrides,
  };
}

interface Case {
  name: string;
  signals: DetectionSignals;
  expected: BrowserFamily;
}

const cases: Case[] = [
  {
    name: 'Vanilla Chrome: plain Chrome UA, no Edg/, no Brave signals',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      userAgentData: {
        brands: [
          { brand: 'Google Chrome', version: '140' },
          { brand: 'Chromium', version: '140' },
        ],
        mobile: false,
        platform: 'Windows',
      },
    }),
    expected: 'vanilla-chrome',
  },
  {
    name: 'Edge: UA contains Edg/',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    }),
    expected: 'edge',
  },
  {
    name: 'Brave Strict: isBrave truthy AND canvas farbling observed',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      farblingObserved: true,
      permissionShape: { ...DEFAULT_PERMS, __braveIsBrave: 'granted' },
    }),
    expected: 'brave-strict',
  },
  {
    name: 'Brave Standard: isBrave truthy but no farbling observed',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      farblingObserved: false,
      permissionShape: { ...DEFAULT_PERMS, __braveIsBrave: 'granted' },
    }),
    expected: 'brave-standard',
  },
  {
    name: 'Firefox RFP: letterboxed screen (width % 200 === 0 AND height % 100 === 0)',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0',
      innerWidth: 1400,
      innerHeight: 900,
      screenWidth: 1920,
      screenHeight: 1080,
    }),
    expected: 'firefox-rfp',
  },
  {
    name: 'Firefox ETP Strict (FPP): Firefox UA, no RFP letterboxing, farblingObserved',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; rv:145.0) Gecko/20100101 Firefox/145.0',
      innerWidth: 1357, // not a 200-multiple
      innerHeight: 823, // not a 100-multiple
      farblingObserved: true,
    }),
    expected: 'firefox-etp-strict',
  },
  {
    name: 'Firefox ETP Standard: Firefox UA, no RFP, no farbling',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0',
      innerWidth: 1357,
      innerHeight: 823,
      farblingObserved: false,
    }),
    expected: 'firefox-etp-standard',
  },
  {
    name: 'LibreWolf: UA contains LibreWolf',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0 LibreWolf/131.0',
    }),
    expected: 'librewolf',
  },
  {
    name: 'Safari: Safari/ but not Chrome/',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/617.1.17 (KHTML, like Gecko) Version/17.4 Safari/617.1.17',
    }),
    expected: 'safari',
  },
  {
    name: 'Safari Lockdown: same as Safari + lockdownModeObserved',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/617.1.17 (KHTML, like Gecko) Version/17.4 Safari/617.1.17',
      lockdownModeObserved: true,
    }),
    expected: 'safari-lockdown',
  },
  {
    name: 'Tor Browser: canonical Tor UA + 200-multiple letterbox + UTC',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
      innerWidth: 1000,
      innerHeight: 1000,
      screenWidth: 1000,
      screenHeight: 1000,
      // Tor-specific marker — implementation consults this via signals.timezone.
      timezone: 'Etc/UTC',
      mediaDevicesEnumerable: false,
      webRtcEnabled: false,
    } as DetectionSignals),
    expected: 'tor-browser',
  },
  {
    name: 'Mullvad Browser: Tor-like UA but WebRTC enabled / media-devices enumerable',
    signals: base({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
      innerWidth: 1000,
      innerHeight: 1000,
      timezone: 'Etc/UTC',
      mediaDevicesEnumerable: true,
      webRtcEnabled: true,
    } as DetectionSignals),
    expected: 'mullvad-browser',
  },
  {
    name: 'Unknown: UA does not match any heuristic',
    signals: base({
      userAgent: 'SomeObscureCrawlerBot/1.0',
    }),
    expected: 'unknown',
  },
];

describe('detectBrowser', () => {
  for (const c of cases) {
    it(`detects ${c.expected} — ${c.name}`, () => {
      const got = detectBrowser(c.signals);
      expect(got.family).toBe(c.expected);
      expect(['high', 'medium', 'low']).toContain(got.confidence);
    });
  }

  it('never throws on bizarre input', () => {
    expect(() =>
      detectBrowser({
        userAgent: '',
        permissionShape: {},
        screenWidth: 0,
        screenHeight: 0,
        innerWidth: 0,
        innerHeight: 0,
        isSecureContext: false,
      })
    ).not.toThrow();
  });

  it('returns low confidence for the unknown fallback', () => {
    const got = detectBrowser(base({ userAgent: 'weird-bot' }));
    expect(got.family).toBe('unknown');
    expect(got.confidence).toBe('low');
  });

  it('returns medium confidence for Mullvad Browser (ambiguous vs Tor)', () => {
    const got = detectBrowser(
      base({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
        innerWidth: 1000,
        innerHeight: 1000,
        timezone: 'Etc/UTC',
        mediaDevicesEnumerable: true,
        webRtcEnabled: true,
      } as DetectionSignals)
    );
    expect(got.family).toBe('mullvad-browser');
    expect(got.confidence).toBe('medium');
  });
});
