/**
 * ScannerApp — the live scanner island.
 *
 * Runs exclusively in the browser (`client:load`). Wrapped in
 * `ReducedMotionProvider` by the Astro page so all motion respects the user's
 * prefers-reduced-motion setting.
 *
 * Lifecycle:
 *   1. `collectSignals()` reads `navigator`/`screen`/Intl once and surfaces
 *      them plus the tiny Brave + farbling hints to `detectBrowser`.
 *   2. All 22 probes fire in parallel under `Promise.allSettled`. Each is
 *      wrapped by `stabilityProbe` (3 reads, ~50ms apart) and then
 *      classified to a `DefenseMode` by `classifyDefenseMode`.
 *   3. The three stub probes that return `{status:'pending', …}` are
 *      re-labelled `pending-backend` and tracked separately from the
 *      defense-mode tally.
 *   4. Results land in a `Map<vectorId, CardState>` and the UI re-renders
 *      incrementally — cards fill in as each probe settles.
 *
 * NOTE: the probe dispatch loop materialises the full VECTOR_CATALOG on mount.
 * That's fine at 22 entries; if the catalog grows past ~40 probes we should
 * switch to `import()`-based lazy loading per family so the initial bundle
 * doesn't balloon.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { VECTOR_CATALOG } from '../../lib/scanner/registry';
import { stabilityProbe } from '../../lib/scanner/stabilityProbe';
import { classifyDefenseMode } from '../../lib/scanner/classifyDefenseMode';
import { detectBrowser } from '../../lib/scanner/detectBrowser';
import { detectLies } from '../../lib/scanner/liesDetection';
import { recommendFixes } from '../../lib/scanner/fixesRecommendation';
import type {
  BrowserFamily,
  DefenseMode,
  VectorEntry,
  VectorFamily,
} from '../../lib/scanner/types';
import { collectSignals } from './signals';
import { ScannerHero } from './ScannerHero';
import { ScannerCategoryBar } from './ScannerCategoryBar';
import { ScannerCard, type CardState, type CardDefenseMode } from './ScannerCard';
import { LiesPanel } from './LiesPanel';
import { TopFixesPanel } from './TopFixesPanel';
import { FAMILY_META } from './familyMeta';
import type { BadgeKey } from './badgeConfig';

interface CardEntry {
  state: CardState;
  defenseMode?: CardDefenseMode;
  rawValue?: unknown;
  errorMessage?: string;
}

type CardMap = Record<string, CardEntry>;

const EMPTY_TALLY: Record<BadgeKey, number> = {
  UNCHANGED: 0,
  SPOOFED: 0,
  FARBLED: 0,
  QUANTIZED: 0,
  BLOCKED: 0,
  'INFO-PUBLIC': 0,
  'INFO-CONTEXT': 0,
  'pending-backend': 0,
};

export function ScannerApp() {
  const [browser, setBrowser] = useState<{
    family: BrowserFamily;
    confidence: 'high' | 'medium' | 'low';
  }>({ family: 'unknown', confidence: 'low' });
  const [cards, setCards] = useState<CardMap>(() => {
    const seed: CardMap = {};
    for (const v of VECTOR_CATALOG) {
      seed[v.id] = { state: v.automatic ? 'scanning' : 'pending' };
    }
    return seed;
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // --- 1. Browser detection
      try {
        const signals = await collectSignals();
        if (cancelled) return;
        setBrowser(detectBrowser(signals));
      } catch {
        // Leave the default `unknown` / `low`. Detection is best-effort.
      }

      // --- 2. Fire every automatic probe in parallel
      const runnables = VECTOR_CATALOG.filter((v) => v.automatic);
      await Promise.allSettled(
        runnables.map(async (vector) => {
          try {
            const stability = await stabilityProbe(vector.id, async () => {
              const r = await vector.probe();
              if (r.error !== undefined) throw new Error(r.error);
              return r.value;
            });

            if (cancelled) return;

            const firstValue = stability.reads[0]?.value;
            const pending = isPendingBackendValue(firstValue);

            if (pending) {
              patchCard(setCards, vector.id, {
                state: 'done',
                defenseMode: 'pending-backend',
                rawValue: firstValue,
              });
              return;
            }

            const defenseMode: DefenseMode = classifyDefenseMode({
              vectorId: vector.id,
              family: vector.family,
              stability,
            });

            patchCard(setCards, vector.id, {
              state: 'done',
              defenseMode,
              rawValue: firstValue,
            });
          } catch (err) {
            if (cancelled) return;
            patchCard(setCards, vector.id, {
              state: 'error',
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          }
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const tally = useMemo(() => buildTally(cards), [cards]);
  const completed = useMemo(
    () =>
      Object.values(cards).filter((c) => c.state === 'done' || c.state === 'error')
        .length,
    [cards]
  );
  const scanDone = completed >= VECTOR_CATALOG.length;

  // Lies detection runs over the raw probe values as they stream in. We
  // only care about completed cards so half-settled results don't trigger
  // false positives.
  const lies = useMemo(() => {
    const rawValues: Record<string, unknown> = {};
    for (const [id, card] of Object.entries(cards)) {
      if (card.state === 'done' && card.rawValue !== undefined) {
        rawValues[id] = card.rawValue;
      }
    }
    return detectLies({ browserFamily: browser.family, rawValues });
  }, [cards, browser.family]);

  // Top-3 fix recommendations — keyed off the UNCHANGED set.
  const fixes = useMemo(() => {
    const unchanged: string[] = [];
    for (const [id, card] of Object.entries(cards)) {
      if (card.state === 'done' && card.defenseMode === 'UNCHANGED') {
        unchanged.push(id);
      }
    }
    return recommendFixes({
      browserFamily: browser.family,
      unchangedVectorIds: unchanged,
    });
  }, [cards, browser.family]);

  const grouped = useMemo(() => groupByFamily(VECTOR_CATALOG), []);
  const familyCounts = useMemo(() => {
    const counts: Record<VectorFamily, number> = {
      network: 0,
      fingerprint: 0,
      sensors: 0,
      permissions: 0,
      storage: 0,
      behavioral: 0,
      'cross-site': 0,
    };
    for (const v of VECTOR_CATALOG) counts[v.family] += 1;
    return counts;
  }, []);

  return (
    <div className="space-y-6">
      <ScannerHero
        browser={browser}
        tally={tally}
        completed={completed}
        total={VECTOR_CATALOG.length}
      />
      <TopFixesPanel fixes={fixes} scanDone={scanDone} />
      <LiesPanel lies={lies} />
      <ScannerCategoryBar familyCounts={familyCounts} />
      <div className="space-y-10">
        {FAMILY_META.map((family) => {
          const vectors = grouped[family.id] ?? [];
          if (vectors.length === 0) return null;
          return (
            <motion.section
              key={family.id}
              id={family.anchor}
              aria-labelledby={`family-${family.id}-heading`}
              className="scroll-mt-16 space-y-4"
            >
              <header>
                <h2
                  id={`family-${family.id}-heading`}
                  className="text-2xl font-semibold tracking-tight"
                >
                  {family.label}
                </h2>
                <p className="text-sm text-text-muted">{family.subtitle}</p>
              </header>
              <div className="grid gap-4 sm:grid-cols-2">
                {vectors.map((vector) => {
                  const card = cards[vector.id] ?? { state: 'scanning' as const };
                  return (
                    <ScannerCard
                      key={vector.id}
                      vector={vector}
                      state={card.state}
                      {...(card.defenseMode !== undefined
                        ? { defenseMode: card.defenseMode }
                        : {})}
                      {...(card.rawValue !== undefined
                        ? { rawValue: card.rawValue }
                        : {})}
                      {...(card.errorMessage !== undefined
                        ? { errorMessage: card.errorMessage }
                        : {})}
                    />
                  );
                })}
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}

export default ScannerApp;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function patchCard(
  setter: React.Dispatch<React.SetStateAction<CardMap>>,
  id: string,
  next: CardEntry
) {
  setter((prev) => ({ ...prev, [id]: next }));
}

function groupByFamily(
  catalog: ReadonlyArray<VectorEntry>
): Partial<Record<VectorFamily, VectorEntry[]>> {
  const acc: Partial<Record<VectorFamily, VectorEntry[]>> = {};
  for (const v of catalog) {
    const list = acc[v.family] ?? [];
    list.push(v);
    acc[v.family] = list;
  }
  return acc;
}

function buildTally(cards: CardMap): Record<BadgeKey, number> {
  const t: Record<BadgeKey, number> = { ...EMPTY_TALLY };
  for (const c of Object.values(cards)) {
    if (c.state !== 'done' || c.defenseMode === undefined) continue;
    t[c.defenseMode] += 1;
  }
  return t;
}

/**
 * The stub probes (`tls-ja4`, `dns-leaks`, `supercookies-hsts-etag-favicon`)
 * return a sentinel object of the form `{ status: 'pending', reason: … }`.
 * Detect that shape so we can render the "pending backend" badge instead of
 * treating a stable sentinel as an UNCHANGED fingerprint.
 */
function isPendingBackendValue(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const rec = v as Record<string, unknown>;
  return rec.status === 'pending';
}
