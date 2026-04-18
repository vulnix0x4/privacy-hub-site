// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { openNonceStore, scheduleSweep, type NonceStore } from './nonceStore';

const stores: NonceStore[] = [];

function open(): NonceStore {
  const store = openNonceStore(':memory:');
  stores.push(store);
  return store;
}

afterEach(() => {
  while (stores.length > 0) {
    const s = stores.pop();
    try {
      s?.close();
    } catch {
      /* ignore */
    }
  }
});

describe('nonceStore', () => {
  describe('issue()', () => {
    it('returns a 36-character UUID', () => {
      const store = open();
      const { nonce } = store.issue();
      expect(typeof nonce).toBe('string');
      expect(nonce).toHaveLength(36);
      // Canonical UUID shape: 8-4-4-4-12 hex groups.
      expect(nonce).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('returns an expiresAt in the future by the default TTL (60s)', () => {
      const store = open();
      const before = Date.now();
      const { expiresAt } = store.issue();
      const after = Date.now();
      // 60,000ms default TTL, ± a small skew for clock reads.
      expect(expiresAt).toBeGreaterThanOrEqual(before + 60_000 - 50);
      expect(expiresAt).toBeLessThanOrEqual(after + 60_000 + 50);
    });

    it('honours an explicit ttlMs', () => {
      const store = open();
      const before = Date.now();
      const { expiresAt } = store.issue(5_000);
      const after = Date.now();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 5_000 - 50);
      expect(expiresAt).toBeLessThanOrEqual(after + 5_000 + 50);
    });

    it('produces unique nonces across calls', () => {
      const store = open();
      const a = store.issue().nonce;
      const b = store.issue().nonce;
      const c = store.issue().nonce;
      expect(new Set([a, b, c]).size).toBe(3);
    });

    it('persists the issued nonce so readOne can find it', () => {
      const store = open();
      const { nonce } = store.issue();
      // Not yet recorded — resolverIp should be null.
      expect(store.readOne(nonce)).toEqual({ resolverIp: null });
    });
  });

  describe('readOne()', () => {
    it('returns null for an unknown nonce', () => {
      const store = open();
      expect(store.readOne('00000000-0000-0000-0000-000000000000')).toBeNull();
    });

    it('returns { resolverIp: null } for an issued but unrecorded nonce', () => {
      const store = open();
      const { nonce } = store.issue();
      expect(store.readOne(nonce)).toEqual({ resolverIp: null });
    });

    it('returns the recorded resolverIp after record()', () => {
      const store = open();
      const { nonce } = store.issue();
      store.record(nonce, '203.0.113.5');
      expect(store.readOne(nonce)).toEqual({ resolverIp: '203.0.113.5' });
    });

    it('returns null for an expired nonce (ttlMs = 0)', async () => {
      const store = open();
      const { nonce } = store.issue(0);
      // 0ms TTL: expires_at <= now immediately. Wait 2ms to guarantee strict inequality.
      await new Promise((r) => setTimeout(r, 2));
      expect(store.readOne(nonce)).toBeNull();
    });
  });

  describe('record()', () => {
    it('returns true when recording a known, unexpired nonce', () => {
      const store = open();
      const { nonce } = store.issue();
      expect(store.record(nonce, '198.51.100.9')).toBe(true);
    });

    it('returns false for an unknown nonce', () => {
      const store = open();
      expect(
        store.record('deadbeef-dead-beef-dead-beefdeadbeef', '198.51.100.9')
      ).toBe(false);
    });

    it('returns false for an expired nonce', async () => {
      const store = open();
      const { nonce } = store.issue(0);
      await new Promise((r) => setTimeout(r, 2));
      expect(store.record(nonce, '198.51.100.9')).toBe(false);
    });

    it('overwrites the resolverIp on repeated records', () => {
      const store = open();
      const { nonce } = store.issue();
      store.record(nonce, '203.0.113.1');
      store.record(nonce, '203.0.113.2');
      expect(store.readOne(nonce)).toEqual({ resolverIp: '203.0.113.2' });
    });
  });

  describe('sweep()', () => {
    it('removes expired rows and returns the number deleted', async () => {
      const store = open();
      const a = store.issue(0).nonce;
      const b = store.issue(0).nonce;
      const fresh = store.issue(60_000).nonce;
      await new Promise((r) => setTimeout(r, 2));

      const deleted = store.sweep();
      expect(deleted).toBe(2);
      // Expired nonces are gone.
      expect(store.readOne(a)).toBeNull();
      expect(store.readOne(b)).toBeNull();
      // Fresh one survives.
      expect(store.readOne(fresh)).toEqual({ resolverIp: null });
    });

    it('returns 0 when nothing has expired', () => {
      const store = open();
      store.issue(60_000);
      expect(store.sweep()).toBe(0);
    });

    it('accepts an explicit now so callers can sweep against a time point', () => {
      const store = open();
      const { nonce, expiresAt } = store.issue(60_000);
      // Sweep at (expiresAt + 1) — the row's expires_at <= now, so it gets deleted.
      const deleted = store.sweep(expiresAt + 1);
      expect(deleted).toBe(1);
      expect(store.readOne(nonce)).toBeNull();
    });
  });

  describe('listActive()', () => {
    it('returns the empty array when the store is empty', () => {
      const store = open();
      expect(store.listActive()).toEqual([]);
    });

    it('returns all currently-active nonces', () => {
      const store = open();
      const a = store.issue().nonce;
      const b = store.issue().nonce;
      const c = store.issue().nonce;
      const got = store.listActive();
      expect(new Set(got)).toEqual(new Set([a, b, c]));
    });

    it('excludes expired nonces', async () => {
      const store = open();
      const fresh = store.issue(60_000).nonce;
      store.issue(0); // will expire immediately
      await new Promise((r) => setTimeout(r, 2));
      const got = store.listActive();
      expect(got).toEqual([fresh]);
    });

    it('respects the limit argument', () => {
      const store = open();
      store.issue();
      store.issue();
      store.issue();
      expect(store.listActive(2)).toHaveLength(2);
    });

    it('returns results in a deterministic (sorted) order', () => {
      const store = open();
      store.issue();
      store.issue();
      store.issue();
      const first = store.listActive();
      const second = store.listActive();
      expect(first).toEqual(second);
      // And the order is lexicographic on the nonce string (sorted).
      const sorted = [...first].sort();
      expect(first).toEqual(sorted);
    });
  });

  describe('scheduleSweep()', () => {
    it('returns a handle with .stop()', () => {
      const store = open();
      const handle = scheduleSweep(store, 10_000);
      expect(typeof handle.stop).toBe('function');
      handle.stop();
    });

    it('sweeps at least once across the interval window', async () => {
      const store = open();
      store.issue(0);
      await new Promise((r) => setTimeout(r, 2));
      const handle = scheduleSweep(store, 5);
      // Wait long enough for at least one tick.
      await new Promise((r) => setTimeout(r, 25));
      handle.stop();

      // Directly re-sweeping should report 0 expired — the auto-sweep already removed them.
      expect(store.sweep()).toBe(0);
    });
  });
});
