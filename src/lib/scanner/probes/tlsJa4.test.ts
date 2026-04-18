import { describe, it, expect } from 'vitest';
import { probe } from './tlsJa4';

describe('tlsJa4 probe (v1 stub)', () => {
  it('resolves with a pending sentinel and no error', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('tls-ja4');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const value = result.value as { status: string; reason: string };
    expect(value.status).toBe('pending');
    expect(typeof value.reason).toBe('string');
  });
});
