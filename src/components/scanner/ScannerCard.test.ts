/**
 * Light render test for ScannerCard.
 *
 * We avoid `@testing-library/react` to keep the devDep set lean — raw
 * `react-dom/client.createRoot` plus `document.querySelector` is enough to
 * assert the visible badge label changes across `defenseMode` props.
 *
 * happy-dom is already configured as the vitest environment (see
 * `vitest.config.ts`), and React 19's concurrent renderer flushes synchronously
 * here under `act`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ScannerCard } from './ScannerCard';
import type { VectorEntry } from '../../lib/scanner/types';

// Stub motion/react so we don't need a full layout engine in tests. motion
// exports `motion.article` as a pass-through; we render plain elements here
// because the tests only care about DOM output, not animation.
import { vi } from 'vitest';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        return ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) =>
          createElement(prop, stripMotionProps(rest), children as never);
      },
    }
  ),
}));

function stripMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } =
    props;
  void initial;
  void animate;
  void exit;
  void transition;
  void whileHover;
  void whileTap;
  void layout;
  return rest;
}

const vector: VectorEntry = {
  id: 'canvas-fingerprinting',
  family: 'fingerprint',
  severity: 'critical',
  prevalence: 'very-common',
  title: 'Canvas fingerprint',
  oneLiner: 'Render text on a canvas, hash the pixels.',
  probe: async () => ({
    vectorId: 'canvas-fingerprinting',
    value: { hash: 'abc' },
    durationMs: 0,
  }),
  automatic: true,
};

describe('ScannerCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the vector title and oneLiner', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'scanning' as const,
        })
      );
    });
    expect(container.textContent).toContain('Canvas fingerprint');
    expect(container.textContent).toContain('Render text on a canvas');
  });

  it('shows a skeleton badge while scanning', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'scanning' as const,
        })
      );
    });
    const badge = container.querySelector(
      `[data-testid="badge-${vector.id}"]`
    ) as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('aria-label')).toBe('Scanning');
  });

  it('renders the "Tracked" label when defenseMode is UNCHANGED', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'done' as const,
          defenseMode: 'UNCHANGED',
          rawValue: { hash: 'abc' },
        })
      );
    });
    const badge = container.querySelector(
      `[data-testid="badge-${vector.id}"]`
    );
    expect(badge?.textContent).toBe('Tracked');
  });

  it('renders the "Blocked — nice" label when defenseMode is BLOCKED', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'done' as const,
          defenseMode: 'BLOCKED',
        })
      );
    });
    const badge = container.querySelector(
      `[data-testid="badge-${vector.id}"]`
    );
    expect(badge?.textContent).toBe('Blocked — nice');
  });

  it('renders the "Farbled" label when defenseMode is FARBLED', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'done' as const,
          defenseMode: 'FARBLED',
        })
      );
    });
    const badge = container.querySelector(
      `[data-testid="badge-${vector.id}"]`
    );
    expect(badge?.textContent).toBe('Farbled');
  });

  it('renders the "Roadmap · Phase 3" label for stub probes', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'done' as const,
          defenseMode: 'pending-backend',
        })
      );
    });
    const badge = container.querySelector(
      `[data-testid="badge-${vector.id}"]`
    );
    expect(badge?.textContent).toBe('Roadmap · Phase 3');
  });

  it('renders an error state when probe fails', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'error' as const,
          errorMessage: 'nope',
        })
      );
    });
    expect(container.textContent).toContain('Probe failed');
    expect(container.textContent).toContain('nope');
  });

  it('includes a Learn more link pointing at the encyclopedia page', () => {
    act(() => {
      root.render(
        createElement(ScannerCard, {
          vector,
          state: 'done' as const,
          defenseMode: 'UNCHANGED',
        })
      );
    });
    const link = container.querySelector('a[href]') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe(`/en/vectors/${vector.id}`);
  });
});
