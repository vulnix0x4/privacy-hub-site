/**
 * Vector probe: `webrtc-local-ip`
 *
 * Opens an RTCPeerConnection with a public STUN server and listens for ICE
 * candidates for up to 1500 ms. Each candidate string is captured verbatim.
 *
 * mDNS hostnames (ending `.local`) are Chromium's obfuscation — their
 * presence indicates the browser is hiding the real LAN address, which is
 * the modern default. The UI treats `hasMdns === true` as a win.
 *
 * This probe cannot run in happy-dom: there's no RTCPeerConnection stub.
 * Browsers without WebRTC (e.g. Tor Browser) surface `status: 'unsupported'`.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'webrtc-local-ip';
const ICE_TIMEOUT_MS = 1500;
const STUN_URL = 'stun:stun.l.google.com:19302';

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const RTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection })
      .RTCPeerConnection;
    if (!RTC) {
      return {
        vectorId: VECTOR_ID,
        value: { status: 'unsupported' },
        durationMs: Math.max(0, now() - start),
      };
    }

    const pc = new RTC({ iceServers: [{ urls: STUN_URL }] });
    const candidates: string[] = [];

    try {
      pc.createDataChannel('probe');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ICE_TIMEOUT_MS);
        pc.onicecandidate = (ev): void => {
          if (!ev.candidate) {
            clearTimeout(timer);
            resolve();
            return;
          }
          const line = ev.candidate.candidate;
          if (line) candidates.push(line);
        };
      });
    } finally {
      try {
        pc.close();
      } catch {
        // Ignore close errors.
      }
    }

    const hasMdns = candidates.some((c) => /\.local\b/i.test(c));
    return {
      vectorId: VECTOR_ID,
      value: { candidates, hasMdns },
      durationMs: Math.max(0, now() - start),
    };
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
  }
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
