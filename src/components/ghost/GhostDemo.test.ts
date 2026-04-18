/**
 * Sanity tests for GhostDemo.
 *
 * Per Phase 6 spec we keep this light: verify the module imports, exports a
 * function component, and renders its hero scaffold without throwing. Deep
 * integration (real canvas/audio/font probes + IntersectionObserver) isn't
 * tractable under happy-dom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Stub Motion so happy-dom doesn't try to animate.
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        return ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => {
          const { initial, animate, exit, transition, whileHover, whileTap, layout, ...clean } =
            rest;
          void initial;
          void animate;
          void exit;
          void transition;
          void whileHover;
          void whileTap;
          void layout;
          return createElement(prop, clean, children as never);
        };
      },
    }
  ),
  useReducedMotion: () => true, // force static-card-with-button flow
}));

// Mock the IndexedDB wrapper so we don't care about happy-dom's IDB shape.
vi.mock('./maskStore', () => ({
  GHOST_DB_NAME: 'privacy-hub-ghost',
  GHOST_STORE_NAME: 'mask',
  GHOST_RECORD_ID: 'current',
  loadMask: vi.fn().mockResolvedValue(null),
  saveMask: vi.fn().mockImplementation(async (hash: string) => ({
    id: 'current',
    hash,
    firstSeen: 0,
    lastSeen: 0,
  })),
  clearMask: vi.fn().mockResolvedValue(undefined),
}));

describe('GhostDemo module', () => {
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
    vi.unstubAllGlobals();
  });

  it('imports without throwing and exports a function component', async () => {
    const mod = await import('./GhostDemo');
    expect(typeof mod.GhostDemo).toBe('function');
    expect(typeof mod.default).toBe('function');
  });

  it('renders the hero scaffold and "Compute now" button under reduced motion', async () => {
    const { GhostDemo } = await import('./GhostDemo');
    act(() => {
      root.render(createElement(GhostDemo));
    });
    expect(container.textContent).toMatch(/You cleared your cookies/i);
    // Under `useReducedMotion: () => true`, the idle phase should show the
    // manual "Compute now" button instead of an auto-trigger.
    expect(container.textContent).toMatch(/Compute now/i);
  });

  it('keeps the "Clear my fingerprint from this browser" button visible inline', async () => {
    const { GhostDemo } = await import('./GhostDemo');
    act(() => {
      root.render(createElement(GhostDemo));
    });
    expect(container.textContent).toMatch(/Clear my fingerprint from this browser/i);
  });

  it('renders the privacy banner promising no-server operation', async () => {
    const { GhostDemo } = await import('./GhostDemo');
    act(() => {
      root.render(createElement(GhostDemo));
    });
    expect(container.textContent).toMatch(/runs entirely in your browser/i);
  });

  it('links to the full scanner below the demo card', async () => {
    const { GhostDemo } = await import('./GhostDemo');
    act(() => {
      root.render(createElement(GhostDemo));
    });
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href') === '/en/scan')).toBe(true);
  });
});
