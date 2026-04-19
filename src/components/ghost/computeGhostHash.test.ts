import { describe, it, expect } from 'vitest';
import {
  buildGhostVector,
  buildResilientVector,
  computeGhostHash,
  computeResilientHash,
} from './computeGhostHash';
import type { GhostHashInputs, ResilientHashInputs } from './computeGhostHash';

/** Stable baseline inputs used across tests. */
function base(overrides: Partial<GhostHashInputs> = {}): GhostHashInputs {
  return {
    canvas: 'c'.repeat(64),
    audio: 'a'.repeat(64),
    userAgent: 'Mozilla/5.0 (test)',
    screen: [1920, 1080, 2],
    timezone: 'UTC',
    fonts: ['Arial', 'Helvetica', 'Inter'],
    ...overrides,
  };
}

describe('buildGhostVector', () => {
  it('sorts fonts ascending so input order does not change the vector', () => {
    const a = buildGhostVector(base({ fonts: ['Zeta', 'Alpha', 'Mono'] }));
    const b = buildGhostVector(base({ fonts: ['Alpha', 'Mono', 'Zeta'] }));
    expect(a.fonts).toEqual(b.fonts);
    expect(a.fonts[0]).toBe('Alpha');
  });

  it('caps the font list at 30 entries', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Font${i.toString().padStart(2, '0')}`);
    const v = buildGhostVector(base({ fonts: many }));
    expect(v.fonts.length).toBe(30);
  });

  it('keeps the key order stable for JSON serialization', () => {
    const keys = Object.keys(buildGhostVector(base()));
    expect(keys).toEqual(['canvas', 'audio', 'userAgent', 'screen', 'timezone', 'fonts']);
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

  it('stable hash is independent of font input order (sorted inside)', async () => {
    const r1 = await computeGhostHash(base({ fonts: ['Arial', 'Helvetica', 'Inter'] }));
    const r2 = await computeGhostHash(base({ fonts: ['Inter', 'Arial', 'Helvetica'] }));
    expect(r1.hash).toBe(r2.hash);
  });

  it('changes when the canvas input changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ canvas: 'd'.repeat(64) }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the audio input changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ audio: 'b'.repeat(64) }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the user agent changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ userAgent: 'something/else' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the screen tuple changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ screen: [1440, 900, 1] }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the timezone changes', async () => {
    const r1 = await computeGhostHash(base());
    const r2 = await computeGhostHash(base({ timezone: 'America/Los_Angeles' }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('changes when the font list differs', async () => {
    const r1 = await computeGhostHash(base({ fonts: ['Arial'] }));
    const r2 = await computeGhostHash(base({ fonts: ['Arial', 'Helvetica'] }));
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('exposes a 6-char display form matching the tail of the full hash', async () => {
    const r = await computeGhostHash(base());
    expect(r.short).toBe(r.hash.slice(-6));
    expect(r.short.length).toBe(6);
  });
});

function resilientBase(
  overrides: Partial<ResilientHashInputs> = {}
): ResilientHashInputs {
  return {
    timezone: 'America/Los_Angeles',
    language: 'en-US',
    platform: 'MacIntel',
    screen: [1920, 1080],
    ...overrides,
  };
}

describe('buildResilientVector / computeResilientHash', () => {
  it('serialises the four resilient fields in a fixed order', () => {
    const v = buildResilientVector(resilientBase());
    const keys = Object.keys(v);
    expect(keys).toEqual(['timezone', 'language', 'platform', 'screen']);
  });

  it('is deterministic for identical inputs', async () => {
    const a = await computeResilientHash(resilientBase());
    const b = await computeResilientHash(resilientBase());
    expect(a.hash).toBe(b.hash);
  });

  it('matches across a Brave-incognito-style pair (same locale, different canvas/audio)', async () => {
    // The user's scenario: same device, same incognito locale, canvas/audio
    // farbled per-session. Strict hash differs; resilient hash matches.
    const normal = await computeResilientHash(resilientBase());
    const incognito = await computeResilientHash(resilientBase());
    expect(normal.hash).toBe(incognito.hash);
  });

  it('changes when any of the four inputs shifts', async () => {
    const anchor = await computeResilientHash(resilientBase());
    const tz = await computeResilientHash(
      resilientBase({ timezone: 'Europe/Berlin' })
    );
    const lang = await computeResilientHash(resilientBase({ language: 'de-DE' }));
    const platform = await computeResilientHash(
      resilientBase({ platform: 'Win32' })
    );
    const screen = await computeResilientHash(
      resilientBase({ screen: [2560, 1440] })
    );
    for (const r of [tz, lang, platform, screen]) {
      expect(r.hash).not.toBe(anchor.hash);
    }
  });

  it('exposes a 6-char display form matching the tail of the full hash', async () => {
    const r = await computeResilientHash(resilientBase());
    expect(r.short).toBe(r.hash.slice(-6));
    expect(r.short.length).toBe(6);
  });
});
