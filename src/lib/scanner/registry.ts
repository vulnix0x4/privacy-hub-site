/**
 * Vector catalog — the single source of truth wiring the 22 probes into
 * `VectorEntry` records the scanner runner iterates over.
 *
 * Order rule (matches design doc §5.2):
 *   1. Group by family in the order declared by `VectorFamily`:
 *      network → fingerprint → sensors → permissions → storage →
 *      behavioral → cross-site.
 *   2. Within each family, order by severity: critical, high, medium, low.
 *   3. Ties within a severity bucket are resolved by design-doc listing order.
 *
 * Every `id` must match the slug the encyclopedia pages use at
 * `/en/vectors/<id>`, and every entry's `probe` must be the exported
 * `probe` from the matching file under `./probes/`.
 */
import type { VectorEntry } from './types';

import { probe as ipGeolocation } from './probes/ipGeolocation';
import { probe as tlsJa4 } from './probes/tlsJa4';
import { probe as dnsLeaks } from './probes/dnsLeaks';
import { probe as webrtcLocalIp } from './probes/webrtcLocalIp';

import { probe as canvasFingerprinting } from './probes/canvasFingerprinting';
import { probe as webglFingerprinting } from './probes/webglFingerprinting';
import { probe as audioFingerprinting } from './probes/audioFingerprinting';
import { probe as fontEnumeration } from './probes/fontEnumeration';
import { probe as timezoneLocale } from './probes/timezoneLocale';
import { probe as webgpuFingerprinting } from './probes/webgpuFingerprinting';
import { probe as userAgentClientHints } from './probes/userAgentClientHints';
import { probe as navigatorProperties } from './probes/navigatorProperties';
import { probe as screenViewport } from './probes/screenViewport';
import { probe as speechSynthesisVoices } from './probes/speechSynthesisVoices';
import { probe as mediaDevices } from './probes/mediaDevices';

import { probe as batteryApi } from './probes/batteryApi';

import { probe as permissionsBitmap } from './probes/permissionsBitmap';

import { probe as thirdPartyCookiesStorage } from './probes/thirdPartyCookiesStorage';
import { probe as supercookiesHstsEtagFavicon } from './probes/supercookiesHstsEtagFavicon';

import { probe as extensionDetection } from './probes/extensionDetection';

import { probe as referrerFederatedLogin } from './probes/referrerFederatedLogin';
import { probe as cdnBotCookies } from './probes/cdnBotCookies';

export const VECTOR_CATALOG: ReadonlyArray<VectorEntry> = [
  // --- network (4) ---
  {
    id: 'ip-geolocation',
    family: 'network',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'IP & geolocation',
    oneLiner: 'Your public address — what every site sees first.',
    probe: ipGeolocation,
    automatic: true,
  },
  {
    id: 'tls-ja4',
    family: 'network',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'TLS fingerprint (JA4)',
    oneLiner: 'Your encrypted handshake has a unique shape — and CDNs are reading it.',
    probe: tlsJa4,
    automatic: true,
  },
  {
    id: 'dns-leaks',
    family: 'network',
    severity: 'high',
    prevalence: 'common',
    title: 'DNS resolver & DoH',
    oneLiner: 'Which resolver actually answers your queries — and is the path encrypted?',
    probe: dnsLeaks,
    automatic: true,
  },
  {
    id: 'webrtc-local-ip',
    family: 'network',
    severity: 'high',
    prevalence: 'common',
    title: 'WebRTC local IP leak',
    oneLiner: 'Your VPN may not be hiding the LAN address WebRTC offers up.',
    probe: webrtcLocalIp,
    automatic: true,
  },

  // --- fingerprint (11) ---
  {
    id: 'canvas-fingerprinting',
    family: 'fingerprint',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'Canvas fingerprint',
    oneLiner:
      'Render text on a canvas, hash the pixels — your GPU + driver + fonts make a near-unique signature.',
    probe: canvasFingerprinting,
    automatic: true,
  },
  {
    id: 'webgl-fingerprinting',
    family: 'fingerprint',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'WebGL renderer & parameters',
    oneLiner:
      'WebGL exposes the unmasked GPU vendor + renderer string in many builds — that alone narrows you to a few thousand.',
    probe: webglFingerprinting,
    automatic: true,
  },
  {
    id: 'audio-fingerprinting',
    family: 'fingerprint',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'AudioContext fingerprint',
    oneLiner:
      'An inaudible sine wave through a compressor — your audio stack hashes uniquely.',
    probe: audioFingerprinting,
    automatic: true,
  },
  {
    id: 'font-enumeration',
    family: 'fingerprint',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'Installed font enumeration',
    oneLiner:
      "Probe ~100 known fonts via measurement; the ones you have leak software you've installed.",
    probe: fontEnumeration,
    automatic: true,
  },
  {
    id: 'timezone-locale',
    family: 'fingerprint',
    severity: 'critical',
    prevalence: 'very-common',
    title: 'Timezone, language, locale',
    oneLiner: "Tor canonicalises to UTC. Your browser doesn't.",
    probe: timezoneLocale,
    automatic: true,
  },
  {
    id: 'webgpu-fingerprinting',
    family: 'fingerprint',
    severity: 'high',
    prevalence: 'common',
    title: 'WebGPU adapter info',
    oneLiner:
      'The next-gen graphics API is even more revealing than WebGL — and the protections lag.',
    probe: webgpuFingerprinting,
    automatic: true,
  },
  {
    id: 'user-agent-and-client-hints',
    family: 'fingerprint',
    severity: 'high',
    prevalence: 'very-common',
    title: 'User-Agent + Client Hints',
    oneLiner: 'What your browser announces — UA-CH supplements, never replaces.',
    probe: userAgentClientHints,
    automatic: true,
  },
  {
    id: 'navigator-properties',
    family: 'fingerprint',
    severity: 'high',
    prevalence: 'very-common',
    title: 'Navigator properties',
    oneLiner: 'Twelve little fields your browser tells every site without asking.',
    probe: navigatorProperties,
    automatic: true,
  },
  {
    id: 'screen-viewport',
    family: 'fingerprint',
    severity: 'high',
    prevalence: 'common',
    title: 'Screen, viewport, DPR',
    oneLiner: 'Your monitor, taskbar, and devicePixelRatio in clear text.',
    probe: screenViewport,
    automatic: true,
  },
  {
    id: 'speech-synthesis-voices',
    family: 'fingerprint',
    severity: 'medium',
    prevalence: 'common',
    title: 'Speech synthesis voices',
    oneLiner:
      'The TTS voices on your device leak your OS + installed language packs.',
    probe: speechSynthesisVoices,
    automatic: true,
  },
  {
    id: 'media-devices',
    family: 'fingerprint',
    severity: 'medium',
    prevalence: 'common',
    title: 'Media device enumeration',
    oneLiner:
      'Without permission, your browser still leaks how many cameras/mics/speakers you have.',
    probe: mediaDevices,
    automatic: true,
  },

  // --- sensors (1) ---
  {
    id: 'battery-api',
    family: 'sensors',
    severity: 'medium',
    prevalence: 'rare',
    title: 'Battery status API',
    oneLiner:
      'Chrome desktop still exposes it. Your discharge curve can re-link sessions across cookie clears.',
    probe: batteryApi,
    automatic: true,
  },

  // --- permissions (1) ---
  {
    id: 'permissions-bitmap',
    family: 'permissions',
    severity: 'high',
    prevalence: 'common',
    title: 'Permissions API bitmap',
    oneLiner:
      'Twenty-three names probed silently — the SHAPE is the fingerprint, not the count.',
    probe: permissionsBitmap,
    automatic: true,
  },

  // --- storage (2) ---
  {
    id: 'third-party-cookies-storage',
    family: 'storage',
    severity: 'high',
    prevalence: 'common',
    title: 'Third-party cookies & storage',
    oneLiner: 'What your browser will hand to a script from a different origin.',
    probe: thirdPartyCookiesStorage,
    automatic: true,
  },
  {
    id: 'supercookies-hsts-etag-favicon',
    family: 'storage',
    severity: 'medium',
    prevalence: 'rare',
    title: 'Supercookies (HSTS / ETag / favicon)',
    oneLiner:
      'Tracking primitives smuggled through HTTPS, caching, and tab icons. Mostly fixed in 2026 — surface what we observe.',
    probe: supercookiesHstsEtagFavicon,
    automatic: true,
  },

  // --- behavioral (1) ---
  {
    id: 'extension-detection',
    family: 'behavioral',
    severity: 'high',
    prevalence: 'common',
    title: 'Browser extension detection',
    oneLiner:
      "Chrome's web_accessible_resources still leak which extensions you have.",
    probe: extensionDetection,
    automatic: true,
  },

  // --- cross-site (2) ---
  {
    id: 'referrer-federated-login',
    family: 'cross-site',
    severity: 'high',
    prevalence: 'common',
    title: 'Referrer + federated-login probes',
    oneLiner:
      "Where you came from, and which IdPs you're already signed into.",
    probe: referrerFederatedLogin,
    automatic: true,
  },
  {
    id: 'cdn-bot-cookies',
    family: 'cross-site',
    severity: 'medium',
    prevalence: 'common',
    title: 'CDN bot-management cookies',
    oneLiner:
      '`__cf_bm`, `_abck`, `_px` — the same cookie following you across most sites.',
    probe: cdnBotCookies,
    automatic: true,
  },
];
