/**
 * TopFixesPanel — rendered between `ScannerHero` and the category bar when
 * the scan finishes with at least one `UNCHANGED` vector.
 *
 * Renders the top 3 highest-leverage fixes from `recommendFixes`. Each card
 * shows:
 *   - Title (imperative voice, directly actionable)
 *   - Short description
 *   - Effort badge (fast / medium / slow with minute count)
 *   - Leverage label ("≈42 bits of entropy removed")
 *   - Covered vector chips (so the user can see which cards this fix
 *     addresses without hunting)
 *   - Optional "Learn more" deep link
 *
 * We render nothing while the scan is in progress; the panel appears once
 * the `ScannerApp` tally stabilises enough to produce recommendations.
 */
import type { RankedFix } from '../../lib/scanner/fixesRecommendation';

export interface TopFixesPanelProps {
  fixes: readonly RankedFix[];
  /** When the scan is still streaming, we hold the panel. */
  scanDone: boolean;
}

export function TopFixesPanel({ fixes, scanDone }: TopFixesPanelProps) {
  if (!scanDone) return null;
  if (fixes.length === 0) return null;

  return (
    <section
      aria-labelledby="top-fixes-heading"
      className="rounded-lg border border-white/10 bg-surface px-5 py-5"
      data-testid="top-fixes-panel"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="top-fixes-heading"
          className="text-lg font-semibold text-text"
        >
          Top {fixes.length} highest-leverage fixes
        </h2>
        <p className="text-xs uppercase tracking-wider text-text-muted">
          ordered by bits of entropy removed
        </p>
      </header>
      <ol className="mt-4 space-y-3">
        {fixes.map((fix, i) => (
          <li
            key={fix.id}
            data-testid={`top-fix-${fix.id}`}
            className="rounded-md border border-white/10 bg-surface-raised px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">
                  <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  {fix.title}
                </p>
                <p className="mt-1 text-xs text-text-muted">{fix.description}</p>
              </div>
              <EffortBadge effort={fix.effort} minutes={fix.effortMinutes} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-state-spoofed/40 bg-state-spoofed/10 px-2 py-0.5 font-medium text-state-spoofed-text">
                {fix.leverageLabel}
              </span>
              {fix.coversInThisScan.slice(0, 5).map((v) => (
                <a
                  key={v}
                  href={`/en/vectors/${v}`}
                  className="rounded-full border border-white/10 bg-surface px-2 py-0.5 text-text-muted hover:text-text"
                >
                  {v}
                </a>
              ))}
              {fix.coversInThisScan.length > 5 ? (
                <span className="text-text-muted">
                  +{fix.coversInThisScan.length - 5} more
                </span>
              ) : null}
              {fix.learnMore ? (
                <a
                  href={fix.learnMore}
                  className="ml-auto text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                >
                  Learn more &rarr;
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EffortBadge({ effort, minutes }: { effort: RankedFix['effort']; minutes: number }) {
  const cls =
    effort === 'fast'
      ? 'bg-state-spoofed/15 text-state-spoofed-text border border-state-spoofed/40'
      : effort === 'medium'
        ? 'bg-state-quantized/15 text-state-quantized-text border border-state-quantized/40'
        : 'bg-state-info/15 text-state-info-text border border-state-info/40';
  const label =
    effort === 'fast' ? 'Fast' : effort === 'medium' ? 'Medium effort' : 'Slower';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {label} · {minutes} min
    </span>
  );
}
