/**
 * UniquenessPill — rendered inside every `ScannerCard` that maps to an
 * entropy-measuring vector.
 *
 * Wording flips with the card's DefenseMode:
 *   - UNCHANGED: "Narrows you to ≈1 in 2,048 users" (red)
 *   - SPOOFED / FARBLED / QUANTIZED / BLOCKED: "Hidden in a crowd of ≈2,048" (green)
 *   - INFO-PUBLIC / INFO-CONTEXT: pill hidden entirely (the vector has no
 *     entropy semantics).
 *   - pending-backend / pending / scanning: pill hidden — we don't have data.
 *
 * Context vectors (DNS leak, supercookies, federated login, CDN cookies)
 * don't carry entropy bits; the mitigation appears as a one-liner under
 * the pill slot instead.
 */
import { getUniqueness, formatOneInN } from '../../lib/scanner/uniqueness';
import type { CardDefenseMode, CardState } from './ScannerCard';

export interface UniquenessPillProps {
  vectorId: string;
  state: CardState;
  defenseMode?: CardDefenseMode;
}

export function UniquenessPill({ vectorId, state, defenseMode }: UniquenessPillProps) {
  if (state !== 'done' || defenseMode === undefined) return null;
  const row = getUniqueness(vectorId);
  if (!row) return null;

  if (row.mode === 'context') {
    // No "1 in N" — just a mitigation hint. Only render for UNCHANGED so we
    // don't nag people who already have this covered.
    if (defenseMode !== 'UNCHANGED') return null;
    return (
      <p
        data-testid={`uniqueness-context-${vectorId}`}
        className="mt-3 rounded-md border border-white/10 bg-surface-raised/60 px-3 py-2 text-xs text-text-muted"
      >
        <span className="font-medium text-text">Fix: </span>
        {row.mitigation}
      </p>
    );
  }

  const isExposed = defenseMode === 'UNCHANGED';
  const isDefended =
    defenseMode === 'SPOOFED' ||
    defenseMode === 'FARBLED' ||
    defenseMode === 'QUANTIZED' ||
    defenseMode === 'BLOCKED';
  if (!isExposed && !isDefended) return null;

  const classTone = isExposed
    ? 'border-state-unchanged/40 bg-state-unchanged/10 text-state-unchanged-text'
    : 'border-state-spoofed/40 bg-state-spoofed/10 text-state-spoofed-text';
  const label = isExposed ? 'Narrows you to' : 'Hidden in a crowd of';
  const headline = `${label} ${formatOneInN(row.bits)} users${row.guessed ? ' (approx.)' : ''}`;

  return (
    <div
      data-testid={`uniqueness-${vectorId}`}
      className={`mt-3 rounded-md border px-3 py-2 text-xs ${classTone}`}
    >
      <p className="font-medium">
        {headline}
        <span className="ml-2 text-[10px] font-normal uppercase tracking-wider opacity-70">
          · {row.bucket}
        </span>
      </p>
      {isExposed ? (
        <p className="mt-1 text-text-muted">
          <span className="font-medium text-text">Fix: </span>
          {row.mitigation}
        </p>
      ) : null}
      <p
        className="mt-1 text-[10px] text-text-muted"
        title={row.source}
      >
        <abbr title={row.source} className="cursor-help underline decoration-dotted">
          source
        </abbr>
        <span className="opacity-70">
          {' '}
          · {row.bits.toFixed(1)} bits
        </span>
      </p>
    </div>
  );
}
