/**
 * ScannerHero — top section above the category bar.
 *
 * Renders: the page title, the detected browser family + confidence, the
 * per-browser verdict (from `verdicts.ts`), and the Defense Mode Profile —
 * a running count of how many cards landed in each DefenseMode.
 *
 * Tally updates live as each probe completes. Stub-probe counts are tracked
 * separately under "Pending" so they don't contaminate the defense-mode math.
 */
import type { BrowserFamily } from '../../lib/scanner/types';
import { VERDICT_BY_BROWSER } from './verdicts';
import { BADGE_CONFIG, type BadgeKey } from './badgeConfig';

export interface ScannerHeroProps {
  browser: { family: BrowserFamily; confidence: 'high' | 'medium' | 'low' };
  tally: Record<BadgeKey, number>;
  completed: number;
  total: number;
}

// Order the tally so the bright celebration states lead the display and
// "Tracked" sits first to call out the problem count up-front.
const DISPLAY_ORDER: BadgeKey[] = [
  'UNCHANGED',
  'BLOCKED',
  'FARBLED',
  'SPOOFED',
  'QUANTIZED',
  'INFO-PUBLIC',
  'INFO-CONTEXT',
  'pending-backend',
];

const BROWSER_DISPLAY: Record<BrowserFamily, string> = {
  'vanilla-chrome': 'Vanilla Chrome',
  edge: 'Microsoft Edge',
  'brave-standard': 'Brave (Standard shields)',
  'brave-strict': 'Brave (Strict shields)',
  'firefox-etp-standard': 'Firefox (ETP Standard)',
  'firefox-etp-strict': 'Firefox (ETP Strict)',
  'firefox-rfp': 'Firefox (RFP on)',
  librewolf: 'LibreWolf',
  safari: 'Safari',
  'safari-lockdown': 'Safari (Lockdown Mode)',
  'tor-browser': 'Tor Browser',
  'mullvad-browser': 'Mullvad Browser',
  unknown: 'Unknown build',
};

export function ScannerHero({ browser, tally, completed, total }: ScannerHeroProps) {
  const verdict = VERDICT_BY_BROWSER[browser.family];
  const browserLabel = BROWSER_DISPLAY[browser.family];
  const tallyParts = DISPLAY_ORDER.filter((key) => tally[key] > 0).map((key) => ({
    key,
    count: tally[key],
    label: BADGE_CONFIG[key].label,
  }));

  const scanning = completed < total;

  return (
    <section
      aria-labelledby="scan-title"
      className="space-y-6 border-b border-white/10 pb-8"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
          Live tracker scan
        </p>
        <h1
          id="scan-title"
          className="text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          {verdict.headline}
        </h1>
        <p className="max-w-3xl text-lg text-text-muted">{verdict.detail}</p>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-surface px-4 py-3">
          <dt className="text-xs uppercase tracking-wider text-text-muted">
            Browser detected
          </dt>
          <dd className="mt-1 text-base text-text">
            {browserLabel}{' '}
            <span className="text-text-muted">
              · {browser.confidence} confidence
            </span>
          </dd>
        </div>
        <div className="rounded-md border border-white/10 bg-surface px-4 py-3">
          <dt className="text-xs uppercase tracking-wider text-text-muted">
            Scan progress
          </dt>
          <dd className="mt-1 text-base text-text" aria-live="polite">
            {completed} / {total} vectors
            {scanning ? ' — scanning…' : ' — done'}
          </dd>
        </div>
      </dl>

      <div
        aria-label="Defense Mode Profile"
        aria-live="polite"
        className="rounded-md border border-white/10 bg-surface px-4 py-4"
      >
        <p className="text-xs uppercase tracking-wider text-text-muted">
          Defense Mode Profile
        </p>
        {tallyParts.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Probing 22 vectors…</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {tallyParts.map((part, i) => (
              <li key={part.key} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CONFIG[part.key].className}`}
                >
                  {part.count} {part.label}
                </span>
                {i < tallyParts.length - 1 ? (
                  <span className="text-text-muted" aria-hidden="true">
                    ·
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
