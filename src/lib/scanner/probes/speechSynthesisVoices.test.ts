import { describe, it, expect } from 'vitest';
import { probe } from './speechSynthesisVoices';

describe('speechSynthesisVoices probe', () => {
  it('returns a voices array or unsupported sentinel without throwing', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('speech-synthesis-voices');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    const value = result.value as { voices: unknown[]; status?: string };
    expect(Array.isArray(value.voices)).toBe(true);
  });
});
