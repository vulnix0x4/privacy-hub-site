import { describe, it, expect } from 'vitest';
import { probe } from './userAgentClientHints';

describe('userAgentClientHints probe', () => {
  it('returns userAgent and either userAgentData or null without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('user-agent-and-client-hints');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as {
      userAgent: string;
      userAgentData: unknown;
    };
    expect(typeof value.userAgent).toBe('string');
    expect(value.userAgentData === null || typeof value.userAgentData === 'object').toBe(true);
  });
});
