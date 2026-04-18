/**
 * GhostDemo — homepage hero island.
 *
 * Renders a self-contained "you cleared your cookies but we still know you"
 * demo. Computes a short fingerprint hash entirely client-side, stores it
 * in the visitor's IndexedDB, and lets the visitor try to escape — then
 * re-hashes and shows one of three verdict cards.
 *
 * Privacy architecture:
 *   - No server request (verified by grep; everything runs in the island).
 *   - The hash lives only in `privacy-hub-ghost` IndexedDB on the visitor's
 *     device. A "Clear my fingerprint from this browser" button is always
 *     visible.
 *   - Reduced-motion users get a static "Compute now" button instead of
 *     the scroll-triggered auto-compute.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { collectGhostInputs, collectDetectionSignals } from './collectGhostInputs';
import { computeGhostHash, type GhostHashResult } from './computeGhostHash';
import { loadMask, saveMask, clearMask } from './maskStore';
import {
  clearSiteData,
  openPrivateWindow,
  type ClearSiteDataResult,
} from './clearActions';
import { getVerdict, isAnonymityBucket, type Verdict } from './verdicts';
import type { VerdictOutcome } from './types';
import { detectBrowser } from '../../lib/scanner/detectBrowser';
import type { BrowserFamily } from '../../lib/scanner/types';
import type { MaskRecord } from './types';

/** Elapsed-ms threshold for "recent visit" vs "returning after > 24 h" copy. */
const RECENT_VISIT_MS = 24 * 60 * 60 * 1_000;

type PhaseKey =
  | 'idle'
  | 'computing'
  | 'ready'
  | 'action-running'
  | 'verdict';

interface ActionLog {
  /** Short, user-facing label of what action was run (e.g. "Clear site data"). */
  label: string;
  /** Secondary detail line (counts, caveats). Empty string renders nothing. */
  summary: string;
}

interface State {
  phase: PhaseKey;
  browser: BrowserFamily;
  firstHash: GhostHashResult | null;
  secondHash: GhostHashResult | null;
  stored: MaskRecord | null;
  storedBefore: MaskRecord | null;
  lastAction: ActionLog | null;
  errorMessage: string | null;
}

type Action =
  | { type: 'set-browser'; family: BrowserFamily }
  | { type: 'begin-compute' }
  | {
      type: 'complete-initial';
      hash: GhostHashResult;
      stored: MaskRecord | null;
      storedBefore: MaskRecord | null;
    }
  | { type: 'begin-action'; label: string }
  | {
      type: 'complete-action';
      hash: GhostHashResult;
      stored: MaskRecord | null;
      log: ActionLog;
    }
  | { type: 'reset-stored' }
  | { type: 'error'; message: string };

const INITIAL_STATE: State = {
  phase: 'idle',
  browser: 'unknown',
  firstHash: null,
  secondHash: null,
  stored: null,
  storedBefore: null,
  lastAction: null,
  errorMessage: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set-browser':
      return { ...state, browser: action.family };
    case 'begin-compute':
      return { ...state, phase: 'computing', errorMessage: null };
    case 'complete-initial':
      return {
        ...state,
        phase: 'ready',
        firstHash: action.hash,
        stored: action.stored,
        storedBefore: action.storedBefore,
      };
    case 'begin-action':
      return {
        ...state,
        phase: 'action-running',
        errorMessage: null,
        lastAction: { label: action.label, summary: '' },
      };
    case 'complete-action':
      return {
        ...state,
        phase: 'verdict',
        secondHash: action.hash,
        stored: action.stored,
        lastAction: action.log,
      };
    case 'reset-stored':
      return { ...state, stored: null, storedBefore: null };
    case 'error':
      return { ...state, errorMessage: action.message };
    default:
      return state;
  }
}

export function GhostDemo() {
  const prefersReducedMotion = useReducedMotion();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggeredRef = useRef(false);

  // Detect the browser family once on mount — used to pick the right verdict.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const signals = await collectDetectionSignals();
        if (cancelled) return;
        dispatch({ type: 'set-browser', family: detectBrowser(signals).family });
      } catch {
        // Leave as `unknown`. Detection is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runInitialCompute = useCallback(async () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    dispatch({ type: 'begin-compute' });
    try {
      // Read the stored record BEFORE we touch it, so we can greet the
      // returning visitor accurately regardless of whether the current hash
      // ends up matching.
      const priorRecord = await loadMask();
      const inputs = await collectGhostInputs();
      const hash = await computeGhostHash(inputs);
      const nextRecord = await saveMask(hash.hash);
      dispatch({
        type: 'complete-initial',
        hash,
        stored: nextRecord,
        storedBefore: priorRecord,
      });
    } catch (err) {
      dispatch({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Scroll-into-view auto-trigger, skipped for reduced-motion users.
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (!rootRef.current) return;
    const el = rootRef.current;
    if (typeof IntersectionObserver === 'undefined') {
      // Older environments: just fire immediately.
      void runInitialCompute();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void runInitialCompute();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion, runInitialCompute]);

  // --- "Try to hide" action handlers ----------------------------------------

  const runAfterAction = useCallback(
    async (label: string, summary: string) => {
      try {
        const inputs = await collectGhostInputs();
        const hash = await computeGhostHash(inputs);
        const nextRecord = await saveMask(hash.hash);
        dispatch({
          type: 'complete-action',
          hash,
          stored: nextRecord,
          log: { label, summary },
        });
      } catch (err) {
        dispatch({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    []
  );

  const onClearSiteData = useCallback(async () => {
    dispatch({ type: 'begin-action', label: 'Clear site data' });
    let report: ClearSiteDataResult | null = null;
    try {
      report = await clearSiteData();
    } catch (err) {
      dispatch({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const summary = `Cleared ${report.cachesCleared} cache(s), ${report.indexedDbsDeleted} IndexedDB(s), ${report.cookiesCleared} cookie(s). LocalStorage ${report.localStorageCleared ? 'cleared' : 'skipped'}.`;
    await runAfterAction('Clear site data', summary);
  }, [runAfterAction]);

  const onOpenPrivate = useCallback(() => {
    dispatch({ type: 'begin-action', label: 'Open in private window' });
    const handle = openPrivateWindow('/en/');
    const summary =
      handle == null
        ? 'Your browser blocked the popup. Try again, or open a private window manually.'
        : 'A new window opened. Browsers may ignore the private-window hint — check yours.';
    void runAfterAction('Open in private window', summary);
  }, [runAfterAction]);

  const onSwitchNetwork = useCallback(() => {
    // No JS action — we just re-hash and show the verdict. The "summary"
    // doubles as the instruction copy the user should have already followed.
    dispatch({ type: 'begin-action', label: 'Switch network' });
    const summary =
      'We assume you flipped your VPN or switched SSID. The hash below reflects the environment right now.';
    void runAfterAction('Switch network', summary);
  }, [runAfterAction]);

  const onClearFingerprint = useCallback(async () => {
    await clearMask();
    dispatch({ type: 'reset-stored' });
  }, []);

  // --- Derived verdict ------------------------------------------------------

  const outcome: VerdictOutcome = useMemo(() => {
    if (state.phase === 'verdict' && state.firstHash && state.secondHash) {
      if (state.firstHash.hash === state.secondHash.hash) {
        return 'persistent';
      }
      if (isAnonymityBucket(state.browser)) {
        return 'anonymity-set';
      }
      return 'drift';
    }
    return 'first-visit';
  }, [state.phase, state.firstHash, state.secondHash, state.browser]);

  const verdict: Verdict | null = useMemo(() => {
    if (state.phase !== 'verdict') return null;
    return getVerdict(state.browser, outcome);
  }, [state.phase, state.browser, outcome]);

  const returningGreeting = useMemo(() => {
    if (!state.storedBefore || !state.firstHash) return null;
    const now = Date.now();
    const elapsed = now - state.storedBefore.lastSeen;
    const same = state.storedBefore.hash === state.firstHash.hash;
    if (elapsed < RECENT_VISIT_MS) {
      return same
        ? 'Still you. Same fingerprint as your last visit.'
        : 'Still you — but a signal shifted since your last visit.';
    }
    return same
      ? 'Welcome back — your fingerprint is the same as last time.'
      : 'Welcome back — your fingerprint drifted since we last saw you.';
  }, [state.storedBefore, state.firstHash]);

  // --- Render ---------------------------------------------------------------

  const shortHash =
    state.phase === 'verdict' && state.secondHash
      ? state.secondHash.short
      : state.firstHash?.short ?? null;

  const fullHash =
    state.phase === 'verdict' && state.secondHash
      ? state.secondHash.hash
      : state.firstHash?.hash ?? null;

  return (
    <section
      ref={rootRef}
      aria-labelledby="ghost-demo-title"
      className="space-y-6"
    >
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
          Ghost demo
        </p>
        <h1
          id="ghost-demo-title"
          className="text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          You cleared your cookies. We still know it's you.
        </h1>
        <p className="max-w-3xl text-lg text-text-muted">
          Below is a hash of your browser's fingerprint — computed right here,
          on your device. We don't have a copy. Try to hide from us anyway.
        </p>
      </div>

      <motion.div
        layout
        className="rounded-lg border border-white/10 bg-surface p-6 space-y-5"
      >
        <HashPanel
          phase={state.phase}
          short={shortHash}
          full={fullHash}
          error={state.errorMessage}
          prefersReducedMotion={prefersReducedMotion === true}
          onManualCompute={runInitialCompute}
        />

        {returningGreeting && state.phase !== 'action-running' ? (
          <p className="text-sm text-text-muted" aria-live="polite">
            {returningGreeting}
          </p>
        ) : null}

        {verdict ? (
          <VerdictPanel
            verdict={verdict}
            outcome={outcome}
            lastAction={state.lastAction}
          />
        ) : null}

        {state.phase === 'ready' || state.phase === 'verdict' ? (
          <TryToHide
            running={false}
            onClear={onClearSiteData}
            onPrivate={onOpenPrivate}
            onNetwork={onSwitchNetwork}
          />
        ) : null}

        {state.phase === 'action-running' ? (
          <p className="text-sm text-text-muted" aria-live="polite">
            Running "{state.lastAction?.label ?? 'action'}" — re-hashing your
            environment…
          </p>
        ) : null}

        <PrivacyBanner onClearFingerprint={onClearFingerprint} />
      </motion.div>

      <p>
        <a
          href="/en/scan"
          className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-base font-medium text-accent hover:bg-accent/20"
        >
          Try the live scanner &rarr;
        </a>
      </p>
    </section>
  );
}

// --- Sub-panels -------------------------------------------------------------

interface HashPanelProps {
  phase: PhaseKey;
  short: string | null;
  full: string | null;
  error: string | null;
  prefersReducedMotion: boolean;
  onManualCompute: () => void;
}

function HashPanel({
  phase,
  short,
  full,
  error,
  prefersReducedMotion,
  onManualCompute,
}: HashPanelProps) {
  if (error) {
    return (
      <div role="alert" className="text-sm text-state-unchanged">
        Ghost demo hit an error: {error}
      </div>
    );
  }

  if (phase === 'idle' && prefersReducedMotion) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-muted">
          Motion is reduced, so we won't compute your fingerprint until you ask.
        </p>
        <button
          type="button"
          onClick={onManualCompute}
          className="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20"
        >
          Compute now
        </button>
      </div>
    );
  }

  if (phase === 'idle' || phase === 'computing' || phase === 'action-running') {
    return (
      <div className="space-y-2" aria-live="polite">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          Your fingerprint
        </p>
        <p className="font-mono text-3xl text-text" aria-busy="true">
          …computing
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-text-muted">
        Your fingerprint
      </p>
      <p className="font-mono text-3xl text-text" aria-live="polite">
        …{short ?? '------'}
      </p>
      {full ? (
        <p className="font-mono text-xs text-text-muted break-all" aria-label="Full SHA-256 hash">
          {full}
        </p>
      ) : null}
    </div>
  );
}

interface VerdictPanelProps {
  verdict: Verdict;
  outcome: VerdictOutcome;
  lastAction: ActionLog | null;
}

function VerdictPanel({ verdict, outcome, lastAction }: VerdictPanelProps) {
  const toneClass =
    verdict.tone === 'red'
      ? 'border-state-unchanged/40 bg-state-unchanged/10 text-text'
      : verdict.tone === 'green'
        ? 'border-state-spoofed/40 bg-state-spoofed/10 text-text'
        : 'border-white/10 bg-surface-raised text-text';
  return (
    <div
      role="status"
      aria-live="polite"
      data-outcome={outcome}
      className={`space-y-2 rounded-md border px-4 py-3 ${toneClass}`}
    >
      <p className="text-base font-semibold">{verdict.headline}</p>
      <p className="text-sm text-text-muted">{verdict.detail}</p>
      {lastAction?.summary ? (
        <p className="text-xs text-text-muted">{lastAction.summary}</p>
      ) : null}
    </div>
  );
}

interface TryToHideProps {
  running: boolean;
  onClear: () => void;
  onPrivate: () => void;
  onNetwork: () => void;
}

function TryToHide({ running, onClear, onPrivate, onNetwork }: TryToHideProps) {
  return (
    <fieldset
      disabled={running}
      className="space-y-3 border-t border-white/10 pt-4"
    >
      <legend className="text-xs uppercase tracking-wider text-text-muted">
        Try to hide
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <HideOption
          label="Clear site data"
          detail="Delete caches, IndexedDB (except this demo's), localStorage, sessionStorage, and same-origin cookies."
          onClick={onClear}
        />
        <HideOption
          label="Open in private window"
          detail="Private windows hide history but not identity. Browsers may not honor the private-window hint."
          onClick={onPrivate}
        />
        <HideOption
          label="Switch network"
          detail="Flip your VPN or switch SSID, then re-hash. IP geolocation usually moves; fingerprints often don't."
          onClick={onNetwork}
        />
      </div>
    </fieldset>
  );
}

interface HideOptionProps {
  label: string;
  detail: string;
  onClick: () => void;
}

function HideOption({ label, detail, onClick }: HideOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col justify-between gap-2 rounded-md border border-white/10 bg-surface-raised px-4 py-3 text-left hover:border-accent/40 hover:bg-accent/5"
    >
      <span className="text-sm font-semibold text-text">{label}</span>
      <span className="text-xs text-text-muted">{detail}</span>
    </button>
  );
}

interface PrivacyBannerProps {
  onClearFingerprint: () => void;
}

function PrivacyBanner({ onClearFingerprint }: PrivacyBannerProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-text-muted max-w-xl">
        This demo runs entirely in your browser. No server. No upload. The hash
        never leaves your device.
      </p>
      <button
        type="button"
        onClick={onClearFingerprint}
        className="self-start rounded-md border border-white/10 bg-surface-raised px-3 py-2 text-xs text-text-muted hover:border-white/30 hover:text-text sm:self-auto"
      >
        Clear my fingerprint from this browser
      </button>
    </div>
  );
}

export default GhostDemo;
