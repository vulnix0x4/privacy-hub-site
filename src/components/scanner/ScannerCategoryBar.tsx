/**
 * ScannerCategoryBar — sticky tablist linking to each family section.
 *
 * Anchors live at `#network`, `#fingerprint`, etc. A click calls
 * `scrollIntoView({behavior:'smooth', block:'start'})` explicitly so
 * reduced-motion users get the instant path via the global CSS rule (we
 * don't need to gate it here because `html { scroll-behavior }` already
 * flips to `auto` under `prefers-reduced-motion: reduce`).
 *
 * Keyboard: roving tabindex. Arrow keys move focus across tabs; Home / End
 * jump to the first/last. Enter or Space activates the focused tab (which
 * triggers the same scroll). The tablist is not an ARIA "tab"/"tabpanel"
 * container because the content underneath is a scroll-spine, not a
 * hidden/visible tabpanel — we keep semantic `<nav>` with `role="tablist"`
 * off and just use anchor links with a tablist-like keyboard model.
 */
import { useCallback, useRef, useState } from 'react';
import { FAMILY_META } from './familyMeta';
import type { VectorFamily } from '../../lib/scanner/types';

export interface ScannerCategoryBarProps {
  /** Mapping from family → vector count, used to render a small badge. */
  familyCounts: Record<VectorFamily, number>;
}

export function ScannerCategoryBar({ familyCounts }: ScannerCategoryBarProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  const focusIdx = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(FAMILY_META.length - 1, idx));
    refs.current[clamped]?.focus();
    setActiveIdx(clamped);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLAnchorElement>, idx: number) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          focusIdx(idx + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          focusIdx(idx - 1);
          break;
        case 'Home':
          e.preventDefault();
          focusIdx(0);
          break;
        case 'End':
          e.preventDefault();
          focusIdx(FAMILY_META.length - 1);
          break;
        default:
          break;
      }
    },
    [focusIdx]
  );

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, family: (typeof FAMILY_META)[number], idx: number) => {
      const el = document.getElementById(family.anchor);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Push the hash without triggering the browser's instant jump.
        history.replaceState(null, '', `#${family.anchor}`);
      }
      setActiveIdx(idx);
    },
    []
  );

  return (
    <nav
      aria-label="Vector families"
      className="sticky top-0 z-10 -mx-4 border-b border-white/10 bg-bg/80 px-4 backdrop-blur"
    >
      <ul className="flex gap-1 overflow-x-auto py-2 text-sm">
        {FAMILY_META.map((family, idx) => {
          const count = familyCounts[family.id] ?? 0;
          const isActive = idx === activeIdx;
          return (
            <li key={family.id} className="shrink-0">
              <a
                ref={(el) => {
                  refs.current[idx] = el;
                }}
                href={`#${family.anchor}`}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={(e) => onKeyDown(e, idx)}
                onClick={(e) => onClick(e, family, idx)}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  isActive
                    ? 'bg-surface text-text'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <span>{family.label}</span>
                {count > 0 ? (
                  <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">
                    {count}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
