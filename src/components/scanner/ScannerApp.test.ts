/**
 * Sanity test for ScannerApp.
 *
 * Per the Phase 5 spec, we skip integration testing against the live probe
 * fleet — that requires a real browser surface we can't mock cheaply. Here we
 * verify the module imports cleanly, exports a function component, and doesn't
 * throw during the initial synchronous render pass. The probe side-effects
 * inside `useEffect` are stubbed (fetch rejected cleanly, brave absent,
 * canvas probe uses the happy-dom fallback) so mount doesn't throw.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Match the motion stub pattern in ScannerCard.test.ts.
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
}));

describe('ScannerApp module', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('disabled in tests')));
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
    const mod = await import('./ScannerApp');
    expect(typeof mod.ScannerApp).toBe('function');
    expect(typeof mod.default).toBe('function');
  });

  it('renders its hero scaffold on mount without throwing', async () => {
    const { ScannerApp } = await import('./ScannerApp');
    act(() => {
      root.render(createElement(ScannerApp));
    });
    expect(container.textContent).toMatch(/Live tracker scan/i);
  });
});
