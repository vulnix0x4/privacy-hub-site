import { describe, test, expect } from 'vitest';
import { classifyDefenseMode } from './classifyDefenseMode';
import type {
  DefenseMode,
  ProbeResult,
  StabilityResult,
  VectorFamily,
} from './types';

/** Helper: build a StabilityResult for a given stability with a single recorded value. */
function stability(
  kind: 'STABLE' | 'JITTERED' | 'ABSENT',
  value: unknown = 'v'
): StabilityResult {
  const reads: ProbeResult[] = [
    { vectorId: 't', value, durationMs: 1 },
    { vectorId: 't', value, durationMs: 1 },
    { vectorId: 't', value, durationMs: 1 },
  ];
  return { stability: kind, reads };
}

interface Row {
  name: string;
  vectorId: string;
  family: VectorFamily;
  stability: StabilityResult;
  knownSpoofValues?: Record<string, unknown>;
  knownQuantizedBuckets?: unknown[];
  expected: DefenseMode;
}

const rows: Row[] = [
  // Stability-driven blanket rules.
  {
    name: 'ABSENT on any family → BLOCKED',
    vectorId: 'webBluetooth',
    family: 'permissions',
    stability: stability('ABSENT'),
    expected: 'BLOCKED',
  },
  {
    name: 'ABSENT even on network → BLOCKED',
    vectorId: 'ipAddress',
    family: 'network',
    stability: stability('ABSENT'),
    expected: 'BLOCKED',
  },
  {
    name: 'JITTERED on fingerprint family → FARBLED',
    vectorId: 'canvas',
    family: 'fingerprint',
    stability: stability('JITTERED'),
    expected: 'FARBLED',
  },
  {
    name: 'JITTERED on sensors family → FARBLED',
    vectorId: 'deviceMotion',
    family: 'sensors',
    stability: stability('JITTERED'),
    expected: 'FARBLED',
  },

  // STABLE with known spoof — SPOOFED wins regardless of family.
  {
    name: 'STABLE + matches known spoof value → SPOOFED (fingerprint)',
    vectorId: 'timezone',
    family: 'fingerprint',
    stability: stability('STABLE', 'Etc/UTC'),
    knownSpoofValues: { torBrowser: 'Etc/UTC' },
    expected: 'SPOOFED',
  },
  {
    name: 'STABLE + matches known spoof (screen) → SPOOFED (fingerprint)',
    vectorId: 'screen',
    family: 'fingerprint',
    stability: stability('STABLE', { width: 1000, height: 1000 }),
    knownSpoofValues: {
      tor: { width: 1000, height: 1000 },
    },
    expected: 'SPOOFED',
  },

  // STABLE with quantized bucket match — QUANTIZED wins when no spoof matches.
  {
    name: 'STABLE + value in Firefox FPP bucket → QUANTIZED',
    vectorId: 'hardwareConcurrency',
    family: 'fingerprint',
    stability: stability('STABLE', 2),
    knownQuantizedBuckets: [1, 2, 4, 8, 16],
    expected: 'QUANTIZED',
  },
  {
    name: 'STABLE + object value in bucket set → QUANTIZED',
    vectorId: 'deviceMemory',
    family: 'fingerprint',
    stability: stability('STABLE', 4),
    knownQuantizedBuckets: [0.25, 0.5, 1, 2, 4, 8],
    expected: 'QUANTIZED',
  },

  // Spoof beats quantization if both are present AND both match.
  {
    name: 'STABLE + value matches both spoof and bucket → SPOOFED',
    vectorId: 'timezone',
    family: 'fingerprint',
    stability: stability('STABLE', 'Etc/UTC'),
    knownSpoofValues: { tor: 'Etc/UTC' },
    knownQuantizedBuckets: ['Etc/UTC', 'America/New_York'],
    expected: 'SPOOFED',
  },

  // Network-family STABLE without spoof/bucket → INFO-PUBLIC for IP/headers.
  {
    name: 'STABLE network IP → INFO-PUBLIC',
    vectorId: 'ipAddress',
    family: 'network',
    stability: stability('STABLE', '203.0.113.5'),
    expected: 'INFO-PUBLIC',
  },
  {
    name: 'STABLE network Accept-Language header → INFO-PUBLIC',
    vectorId: 'acceptLanguageHeader',
    family: 'network',
    stability: stability('STABLE', 'en-US,en;q=0.9'),
    expected: 'INFO-PUBLIC',
  },

  // STABLE fallthrough → UNCHANGED.
  {
    name: 'STABLE fingerprint with no spoof/bucket → UNCHANGED',
    vectorId: 'userAgent',
    family: 'fingerprint',
    stability: stability('STABLE', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)…'),
    expected: 'UNCHANGED',
  },
  {
    name: 'STABLE storage family with nothing matched → UNCHANGED',
    vectorId: 'localStorageQuota',
    family: 'storage',
    stability: stability('STABLE', 10485760),
    expected: 'UNCHANGED',
  },
  {
    name: 'STABLE cross-site with no spoof/bucket → UNCHANGED',
    vectorId: 'referrer',
    family: 'cross-site',
    stability: stability('STABLE', 'https://example.com/'),
    expected: 'UNCHANGED',
  },
  {
    name: 'STABLE behavioral with no spoof/bucket → UNCHANGED',
    vectorId: 'mouseMovement',
    family: 'behavioral',
    stability: stability('STABLE', { x: 1, y: 1 }),
    expected: 'UNCHANGED',
  },
];

describe('classifyDefenseMode', () => {
  test.each(rows)('$name', (row) => {
    const got = classifyDefenseMode({
      vectorId: row.vectorId,
      family: row.family,
      stability: row.stability,
      ...(row.knownSpoofValues !== undefined ? { knownSpoofValues: row.knownSpoofValues } : {}),
      ...(row.knownQuantizedBuckets !== undefined
        ? { knownQuantizedBuckets: row.knownQuantizedBuckets }
        : {}),
    });
    expect(got).toBe(row.expected);
  });
});
