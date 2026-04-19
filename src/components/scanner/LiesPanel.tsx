/**
 * LiesPanel — rendered between `ScannerHero` and the category bar when the
 * scan detects cross-signal contradictions (UA claims Windows + WebGL reports
 * Apple Silicon, UA-CH brands disagree with the UA string, etc.).
 *
 * Silent when no lies are found. That matters: most real-world visitors on
 * real browsers will see zero lies, and we don't want an empty panel
 * cluttering the page.
 *
 * Severity → tone:
 *   - definite-lie: red border, alarm voice
 *   - likely-lie: amber border ('unchanged' token — we don't have a third colour yet)
 *   - suspicious: blue border, neutral voice
 */
import type { Lie } from '../../lib/scanner/liesDetection';

export interface LiesPanelProps {
  lies: readonly Lie[];
}

export function LiesPanel({ lies }: LiesPanelProps) {
  if (lies.length === 0) return null;
  const hasDefinite = lies.some((l) => l.severity === 'definite-lie');
  const hasLikely = lies.some((l) => l.severity === 'likely-lie');
  const tone = hasDefinite
    ? 'border-state-unchanged/60 bg-state-unchanged/5'
    : hasLikely
      ? 'border-state-unchanged/30 bg-state-unchanged/5'
      : 'border-state-blocked/40 bg-state-blocked/5';

  return (
    <section
      aria-labelledby="lies-panel-heading"
      className={`rounded-lg border px-5 py-4 ${tone}`}
      data-testid="lies-panel"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="lies-panel-heading" className="text-lg font-semibold text-text">
          Contradictions detected
        </h2>
        <span className="text-xs uppercase tracking-wider text-text-muted">
          {lies.length} {lies.length === 1 ? 'signal' : 'signals'}
        </span>
      </header>
      <p className="mt-1 text-sm text-text-muted">
        Your browser's fingerprint surfaces disagree with each other. That's
        usually a UA-spoofer, an anti-detect stack, or an automation tool — or
        your device genuinely is in an unusual state worth knowing about.
      </p>
      <ul className="mt-4 space-y-3">
        {lies.map((lie) => (
          <li
            key={lie.id}
            data-testid={`lie-${lie.id}`}
            className="rounded-md border border-white/10 bg-surface px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-text">{lie.headline}</p>
              <SeverityBadge severity={lie.severity} />
            </div>
            <p className="mt-1 text-xs text-text-muted">{lie.evidence}</p>
            {lie.relatedVectors.length > 0 ? (
              <p className="mt-2 text-xs text-text-muted">
                <span className="font-medium text-text">Related: </span>
                {lie.relatedVectors.map((v, i) => (
                  <span key={v}>
                    <a
                      href={`/en/vectors/${v}`}
                      className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                    >
                      {v}
                    </a>
                    {i < lie.relatedVectors.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeverityBadge({ severity }: { severity: Lie['severity'] }) {
  const cls =
    severity === 'definite-lie'
      ? 'bg-state-unchanged/15 text-state-unchanged-text border border-state-unchanged/40'
      : severity === 'likely-lie'
        ? 'bg-state-unchanged/10 text-state-unchanged-text border border-state-unchanged/30'
        : 'bg-state-blocked/15 text-state-blocked-text border border-state-blocked/40';
  const label =
    severity === 'definite-lie'
      ? 'Definite'
      : severity === 'likely-lie'
        ? 'Likely'
        : 'Suspicious';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}
