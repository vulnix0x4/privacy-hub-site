import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VECTOR_CATALOG } from './registry';
import type { VectorFamily } from './types';

describe('VECTOR_CATALOG registry', () => {
  beforeEach(() => {
    // ipGeolocation and extensionDetection use fetch; the default happy-dom
    // fetch rejects with ECONNREFUSED which is fine (probes catch it) but
    // spams stderr. Stub fetch to reject cleanly for the catalog scan.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network disabled in tests'))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('contains exactly 22 entries', () => {
    expect(VECTOR_CATALOG).toHaveLength(22);
  });

  it('every entry has a unique id', () => {
    const ids = VECTOR_CATALOG.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every entry has a non-empty id, title, oneLiner, and probe function', () => {
    for (const entry of VECTOR_CATALOG) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(typeof entry.oneLiner).toBe('string');
      expect(entry.oneLiner.length).toBeGreaterThan(0);
      expect(typeof entry.probe).toBe('function');
      expect(typeof entry.automatic).toBe('boolean');
    }
  });

  it('every probe returns a ProbeResult whose vectorId matches its entry id', async () => {
    for (const entry of VECTOR_CATALOG) {
      const result = await entry.probe();
      expect(result.vectorId).toBe(entry.id);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);

  it('covers exactly the expected 22 vector IDs', () => {
    const expected = new Set([
      'ip-geolocation',
      'dns-leaks',
      'webrtc-local-ip',
      'tls-ja4',
      'canvas-fingerprinting',
      'webgl-fingerprinting',
      'webgpu-fingerprinting',
      'audio-fingerprinting',
      'font-enumeration',
      'user-agent-and-client-hints',
      'navigator-properties',
      'screen-viewport',
      'timezone-locale',
      'speech-synthesis-voices',
      'media-devices',
      'battery-api',
      'permissions-bitmap',
      'third-party-cookies-storage',
      'supercookies-hsts-etag-favicon',
      'extension-detection',
      'referrer-federated-login',
      'cdn-bot-cookies',
    ]);
    const actual = new Set(VECTOR_CATALOG.map((e) => e.id));
    expect(actual).toEqual(expected);
  });

  it('entries are grouped by family in the design-doc order', () => {
    const familyOrder: VectorFamily[] = [
      'network',
      'fingerprint',
      'sensors',
      'permissions',
      'storage',
      'behavioral',
      'cross-site',
    ];
    // Walk the catalog; each time the family changes, it must advance forward
    // in the declared ordering (never backwards).
    let lastIdx = -1;
    for (const entry of VECTOR_CATALOG) {
      const idx = familyOrder.indexOf(entry.family);
      expect(idx).toBeGreaterThanOrEqual(lastIdx);
      lastIdx = idx;
    }
  });
});
