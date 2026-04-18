import { describe, it, expect } from 'vitest';
import { probe } from './dnsLeaks';

describe('dnsLeaks probe (v1 stub)', () => {
  it('resolves with a pending sentinel and no error', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('dns-leaks');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(typeof value.reason).toBe('string');
  });
});
