/**
 * ScannerCard — one per vector in the live scan.
 *
 * Receives its `state` and `defenseMode` from `ScannerApp`. Pending / scanning
 * states render a pulse skeleton; once the result lands we animate the card
 * to its final shape via a single `motion.div`. Reduced-motion users get the
 * instant render path via the wrapping `ReducedMotionProvider`.
 *
 * a11y:
 *   - `aria-live="polite"` on the body row so screen readers announce updates
 *     as each probe completes.
 *   - `aria-busy` toggles during scan.
 *   - `<details>` is native keyboard-accessible; no custom widget.
 */
import { motion } from 'motion/react';
import type { VectorEntry, DefenseMode } from '../../lib/scanner/types';
import { BADGE_CONFIG, FAMILY_PILL_CLASS } from './badgeConfig';
import { getInterpretation } from './interpretation';
import { UniquenessPill } from './UniquenessPill';

export type CardState = 'pending' | 'scanning' | 'done' | 'error';
export type CardDefenseMode = DefenseMode | 'pending-backend';

export interface ScannerCardProps {
  vector: VectorEntry;
  state: CardState;
  defenseMode?: CardDefenseMode;
  rawValue?: unknown;
  errorMessage?: string;
}

export function ScannerCard({
  vector,
  state,
  defenseMode,
  rawValue,
  errorMessage,
}: ScannerCardProps) {
  const isBusy = state === 'scanning' || state === 'pending';
  const badge =
    state === 'done' && defenseMode !== undefined
      ? BADGE_CONFIG[defenseMode]
      : undefined;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-white/10 bg-surface p-5 shadow-sm"
      aria-labelledby={`vector-${vector.id}-title`}
      aria-busy={isBusy}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 font-medium uppercase tracking-wider ${
                FAMILY_PILL_CLASS[vector.family] ?? ''
              }`}
            >
              {vector.family}
            </span>
            <span className="text-text-muted">{vector.severity}</span>
          </div>
          <h3
            id={`vector-${vector.id}-title`}
            className="mt-2 text-lg font-semibold text-text"
          >
            {vector.title}
          </h3>
          <p className="mt-1 text-sm text-text-muted">{vector.oneLiner}</p>
        </div>
        <div className="shrink-0">
          {badge ? (
            <span
              data-testid={`badge-${vector.id}`}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          ) : (
            <span
              data-testid={`badge-${vector.id}`}
              className="inline-flex h-6 w-28 animate-pulse rounded-full bg-surface-raised"
              aria-label="Scanning"
            />
          )}
        </div>
      </header>

      <div aria-live="polite" className="mt-4 text-sm text-text">
        {state === 'error' ? (
          <p className="text-state-unchanged">
            Probe failed: {errorMessage ?? 'unknown error'}
          </p>
        ) : state === 'done' ? (
          <p>{getInterpretation(defenseMode, vector.family)}</p>
        ) : (
          <p className="text-text-muted">Reading the live environment…</p>
        )}
        <UniquenessPill
          vectorId={vector.id}
          state={state}
          {...(defenseMode !== undefined ? { defenseMode } : {})}
        />
      </div>

      <footer className="mt-4 flex items-center justify-between gap-3 text-xs">
        <a
          href={`/en/vectors/${vector.id}`}
          className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          Learn more &rarr;
        </a>
        {state === 'done' && rawValue !== undefined ? (
          <details className="group min-w-0 flex-1 text-right">
            <summary className="inline-block cursor-pointer text-text-muted hover:text-text">
              Show raw
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-bg p-3 text-left font-mono text-xs text-text-muted">
              {safeStringify(rawValue)}
            </pre>
          </details>
        ) : null}
      </footer>
    </motion.article>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
