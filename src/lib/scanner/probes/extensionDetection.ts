/**
 * Vector probe: `extension-detection`
 *
 * Chromium's MV3 still exposes `web_accessible_resources` to any origin
 * that knows the extension ID. Fetching `chrome-extension://<id>/manifest.json`
 * resolves with 200 when the extension is installed and the manifest file is
 * marked web-accessible — a TypeError (or a 404) otherwise.
 *
 * The allow-list is intentionally small — a handful of well-known extensions
 * whose web-accessible assets are stable across versions. Expanding the list
 * is a deliberate review moment, not an open-ended probe.
 */
import type { ProbeResult } from '../types';

const VECTOR_ID = 'extension-detection';
const PROBE_TIMEOUT_MS = 200;

/** Extension ID → human name. IDs are Chromium's canonical `chrome-extension://` prefix. */
const KNOWN_EXTENSIONS: Array<{ id: string; name: string }> = [
  { id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm', name: 'uBlock Origin' },
  { id: 'pkehgijcmpdhfbdbbnkijodmdjhbjlgp', name: 'Privacy Badger' },
  { id: 'nkbihfbeogaeaoehlefnkodbefgpgknn', name: 'MetaMask' },
  { id: 'hdokiejnpimakedhajhdlcegeplioahd', name: 'LastPass' },
];

export async function probe(): Promise<ProbeResult> {
  const start = now();
  try {
    const probed = KNOWN_EXTENSIONS.map((e) => e.id);
    if (typeof fetch === 'undefined') {
      return done(start, { probed, detected: [] });
    }

    const detected: string[] = [];
    await Promise.all(
      KNOWN_EXTENSIONS.map(async (ext) => {
        const found = await tryProbe(ext.id);
        if (found) detected.push(ext.id);
      })
    );
    return done(start, { probed, detected });
  } catch (err) {
    return {
      vectorId: VECTOR_ID,
      value: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0, now() - start),
    };
  }
}

async function tryProbe(extensionId: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`chrome-extension://${extensionId}/manifest.json`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function done(start: number, value: unknown): ProbeResult {
  return {
    vectorId: VECTOR_ID,
    value,
    durationMs: Math.max(0, now() - start),
  };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
