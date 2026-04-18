import { describe, it, expect } from 'vitest';
import { probe } from './webrtcLocalIp';

// happy-dom has no RTCPeerConnection implementation. The probe should short-
// circuit to `{ status: 'unsupported' }` rather than throw.
describe('webrtcLocalIp probe', () => {
  it('returns status=unsupported in environments without RTCPeerConnection', async () => {
    const result = await probe();
    expect(result.vectorId).toBe('webrtc-local-ip');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // Either unsupported sentinel or a captured error — never throw.
    if (result.error === undefined) {
      const value = result.value as { status?: string; candidates?: string[] };
      expect(
        value.status === 'unsupported' || Array.isArray(value.candidates)
      ).toBe(true);
    } else {
      expect(typeof result.error).toBe('string');
    }
  });
});
