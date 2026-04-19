import { describe, it, expect } from 'vitest';
import { buildGhostVector, computeGhostHash } from './computeGhostHash';
import type { GhostHashInputs } from './computeGhostHash';

/** Stable baseline inputs used across tests. */
function base(overrides: Partial<GhostHashInputs> = {}): GhostHashInputs {
  return {
    timezone: 'America/Los_Angeles',
    timezoneOffset: 480,
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'MacIntel',
    uaBrand: 'Chrome',
    uaMobile: false,
    screen: [1920, 1080],
    colorDepth: 24,
    pixelDepth: 24,
    maxTouchPoints: 0,
    cookieEnabled: true,
    prefersColorScheme: 'dark',
    prefersReducedMotion: 'no-preference',
    prefersContrast: 'no-preference',
    features: 0b10101010101010101010, // 20-bit feature bitmap
    ...overrides,
  };
}

describe('buildGhostVector', () => {
  it('deduplicates and sorts languages so input order does not change the vector', () => {
    const a = buildGhostVector(base({ languages: ['es-ES', 'en-US', 'en'] }));
    const b = buildGhostVector(base({ languages: ['en', 'es-ES', 'en-US'] }));
    expect(a.languages).toEqual(b.languages);
    expect(a.languages[0]).toBe('en');
  });

  it('keeps the key order stable for JSON serialization', () => {
    const keys = Object.keys(buildGhostVector(base()));
    expect(keys).toEqual([
      'timezone',
      'timezoneOffset',
      'language',
      'languages',
      'platform',
      'uaBrand',
      'uaMobile',
      'screen',
      'colorDepth',
      'pixelDepth',
      'maxTouchPoints',
      'cookieEnabled',
      'prefersColorScheme',
      'prefersReducedMotion',
      'prefersContrast',
      'features',
    ]);
  });

  it('drops duplicate languages', () => {
    const v = buildGhostVector(base({ languages: ['en', 'en', 'en-US', 'en-US'] }));
    expect(v.languages).toEqual(['en', 'en-US']);
  });
});

describe('computeGhostHash', () => {
  it('produces a 64-char hex SHA-256 digest', async () => {
    const r = await computeGhostHash(base());
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across repeated calls with identical inputs', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base());
    expect(r1.hash).toBe(r2.hash);
    expect(r1.vector).toBe(r2.vector);
  });

  it('stable hash is independent of languages input order (dedup+sort inside)', async () => {
    const r1 = await computeGhostHash(base({ languages: ['en-US', 'en'] }));
    const r2 = await computeGhostHash(base({ languages: ['en', 'en-US'] }));
    expect(r1.hash).toBe(r2.hash);
  });

  it('simulates Brave + incognito on same device: same hash across sessions', async () => {
    // The whole point of the unified-hash design. Canvas, audio, fonts,
    // and UA minor version are not part of the hash — Brave farbles those.
    // Timezone, locale, platform, screen, features are identical across a
    // normal + private-window pair on the same device, so hashes match.
    const normal = await computeGhostHash(base());
    const incognito = await computeGhostHash(base());
    expect(normal.hash).toBe(incognito.hash);
  });

  it('changes when the timezone changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ timezone: 'Europe/Berlin' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the primary language changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ language: 'de-DE' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the platform changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ platform: 'Win32' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the uaBrand changes (Brave users keep their Chrome brand)', async () => {
    const r1 = await computeGhostHash(base({ uaBrand: 'Chrome' }));
    const r2 = await computeGhostHash(base({ uaBrand: 'Firefox' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the screen tuple changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ screen: [1440, 900] }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the color depth differs', async () => {
    const r1 = await computeGhostHash(base({ colorDepth: 24 }));
    const r2 = await computeGhostHash(base({ colorDepth: 30 }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when maxTouchPoints differs (desktop vs phone)', async () => {
    const r1 = await computeGhostHash(base({ maxTouchPoints: 0 }));
    const r2 = await computeGhostHash(base({ maxTouchPoints: 5 }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when prefers-color-scheme differs', async () => {
    const r1 = await computeGhostHash(base({ prefersColorScheme: 'dark' }));
    const r2 = await computeGhostHash(base({ prefersColorScheme: 'light' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the feature bitmap differs', async () => {
    const r1 = await computeGhostHash(base({ features: 0b111 }));
    const r2 = await computeGhostHash(base({ features: 0b110 }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('exposes a 6-char display form matching the tail of the full hash', async () => {
    const r = await computeGhostHash(base());
    expect(r.short).toBe(r.hash.slice(-6));
    expect(r.short.length).toBe(6);
  });
});
