import { describe, it, expect } from 'vitest';
import { probe } from './referrerFederatedLogin';

describe('referrerFederatedLogin probe', () => {
  it('returns referrer + FedCM flags without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('referrer-federated-login');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as {
      documentReferrer: string;
      federatedCredential: boolean;
      identityCredential: boolean;
    };
    expect(typeof value.documentReferrer).toBe('string');
    expect(typeof value.federatedCredential).toBe('boolean');
    expect(typeof value.identityCredential).toBe('boolean');
  });
});
