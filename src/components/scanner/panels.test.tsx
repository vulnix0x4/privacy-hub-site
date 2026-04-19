import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LiesPanel } from './LiesPanel';
import { TopFixesPanel } from './TopFixesPanel';
import { UniquenessPill } from './UniquenessPill';
import type { Lie } from '../../lib/scanner/liesDetection';
import type { RankedFix } from '../../lib/scanner/fixesRecommendation';

/**
 * These are smoke-level SSR render tests — we don't have @testing-library
 * installed so we exercise the components through `renderToString` and
 * assert on the output HTML. That's enough to catch null-ref, unhandled
 * branches, and missing test ids.
 */

describe('LiesPanel', () => {
  it('renders nothing when given an empty lies list', () => {
    const html = renderToString(<LiesPanel lies={[]} />);
    expect(html).toBe('');
  });

  it('renders a definite-lie with its headline, evidence, and related vectors', () => {
    const lies: Lie[] = [
      {
        id: 'ua-vs-webgl-platform',
        severity: 'definite-lie',
        headline: 'UA claims Windows, GPU reports macOS.',
        evidence: 'UA contains "Windows NT 10.0"; WebGL renderer is "Apple M2 Pro".',
        relatedVectors: ['user-agent-and-client-hints', 'webgl-fingerprinting'],
      },
    ];
    const html = renderToString(<LiesPanel lies={lies} />);
    expect(html).toContain('UA claims Windows, GPU reports macOS.');
    expect(html).toContain('Definite');
    expect(html).toContain('/en/vectors/user-agent-and-client-hints');
    expect(html).toContain('lie-ua-vs-webgl-platform');
  });

  it('uses the suspicious tone when no definite/likely lies are present', () => {
    const lies: Lie[] = [
      {
        id: 'timezone-vs-locale-region',
        severity: 'suspicious',
        headline: 'Timezone and locale unusual combo.',
        evidence: 'Could be diaspora, could be VPN.',
        relatedVectors: ['timezone-locale'],
      },
    ];
    const html = renderToString(<LiesPanel lies={lies} />);
    expect(html).toContain('Suspicious');
  });
});

describe('TopFixesPanel', () => {
  const fix: RankedFix = {
    id: 'switch-to-brave-strict',
    title: 'Switch to Brave with Strict shields.',
    description: 'Farbles canvas, audio, WebGL.',
    effort: 'fast',
    effortMinutes: 15,
    covers: ['canvas-fingerprinting', 'audio-fingerprinting'],
    leverageBits: 17,
    leverageLabel: '≈17 bits of entropy removed',
    coversInThisScan: ['canvas-fingerprinting', 'audio-fingerprinting'],
  };

  it('renders nothing when the scan is not yet done', () => {
    const html = renderToString(<TopFixesPanel fixes={[fix]} scanDone={false} />);
    expect(html).toBe('');
  });

  it('renders nothing when there are no fixes', () => {
    const html = renderToString(<TopFixesPanel fixes={[]} scanDone={true} />);
    expect(html).toBe('');
  });

  it('renders each fix with numbering, title, covers chips, and leverage', () => {
    const html = renderToString(<TopFixesPanel fixes={[fix]} scanDone={true} />);
    expect(html).toContain('Switch to Brave with Strict shields.');
    expect(html).toContain('≈17 bits of entropy removed');
    expect(html).toContain('canvas-fingerprinting');
    expect(html).toContain('Fast');
    // React SSR inserts <!-- --> separators around interpolated numbers,
    // so we check each piece independently instead of the full phrase.
    expect(html).toMatch(/Top\b[\s\S]*1[\s\S]*highest-leverage fixes/);
  });
});

describe('UniquenessPill', () => {
  it('renders nothing while scanning', () => {
    const html = renderToString(
      <UniquenessPill vectorId="canvas-fingerprinting" state="scanning" />
    );
    expect(html).toBe('');
  });

  it('renders exposed copy for UNCHANGED entropy vector', () => {
    const html = renderToString(
      <UniquenessPill
        vectorId="canvas-fingerprinting"
        state="done"
        defenseMode="UNCHANGED"
      />
    );
    expect(html).toContain('Narrows you to');
    expect(html).toContain('Fix:');
  });

  it('renders defended copy for FARBLED entropy vector', () => {
    const html = renderToString(
      <UniquenessPill
        vectorId="canvas-fingerprinting"
        state="done"
        defenseMode="FARBLED"
      />
    );
    expect(html).toContain('Hidden in a crowd of');
  });

  it('renders context-mode mitigation for UNCHANGED DNS leak', () => {
    const html = renderToString(
      <UniquenessPill vectorId="dns-leaks" state="done" defenseMode="UNCHANGED" />
    );
    expect(html).toContain('DNS-over-HTTPS');
    expect(html).not.toContain('Narrows you to');
  });

  it('renders nothing for context-mode vector that is already defended', () => {
    const html = renderToString(
      <UniquenessPill vectorId="dns-leaks" state="done" defenseMode="BLOCKED" />
    );
    expect(html).toBe('');
  });

  it('renders nothing for INFO-PUBLIC vector (no entropy semantics)', () => {
    const html = renderToString(
      <UniquenessPill
        vectorId="canvas-fingerprinting"
        state="done"
        defenseMode="INFO-PUBLIC"
      />
    );
    expect(html).toBe('');
  });

  it('renders nothing for a vector id with no uniqueness row', () => {
    const html = renderToString(
      <UniquenessPill
        vectorId="does-not-exist"
        state="done"
        defenseMode="UNCHANGED"
      />
    );
    expect(html).toBe('');
  });
});
