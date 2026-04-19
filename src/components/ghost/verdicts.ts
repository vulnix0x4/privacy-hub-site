/**
 * Ghost Demo verdict copy — keyed by {@link BrowserFamily} × {@link VerdictOutcome}.
 *
 * After a visitor runs a "Try to hide" action, we re-hash their environment
 * and classify the result. The copy here is what the UI shows. Voice mirrors
 * design-doc §2.1: direct, opinionated, no clickbait. The Tor / Mullvad
 * branches frame success as "you joined a crowd," not "you escaped" —
 * that's the correct threat model.
 *
 * Important context for the post-unified-hash design: the Ghost hash is
 * built from signals Brave's farbling does NOT touch (timezone, locale,
 * OS, screen dims, feature bitmap). That means Brave strict users will
 * typically see a `persistent` match across incognito — because the signals
 * we hash really didn't change. The verdict copy explains that honestly.
 */
import type { BrowserFamily, VerdictOutcome } from './types';

/** Shape of a single verdict card: a short headline and a 1-2 sentence detail. */
export interface Verdict {
  /** Red / green / neutral tone hint — maps to Tailwind state tokens. */
  tone: 'red' | 'green' | 'neutral';
  /** Short, emphatic headline. One sentence. */
  headline: string;
  /** 1-2 sentences with the reasoning or next step. */
  detail: string;
}

/** First-visit card — no stored hash, no comparison yet. */
const FIRST_VISIT_DEFAULT: Verdict = {
  tone: 'neutral',
  headline: "We just hashed your browser's fingerprint locally.",
  detail:
    "We don't have a copy — it lives only in your IndexedDB. Try to hide from us anyway.",
};

/**
 * Per-family overrides for the first-visit card. Only families with a
 * distinctive framing need an override; everyone else falls through to the
 * default copy above.
 */
const FIRST_VISIT_BY_FAMILY: Partial<Record<BrowserFamily, Verdict>> = {
  'tor-browser': {
    tone: 'green',
    headline: 'You look like every other Tor user.',
    detail:
      "Tor's goal isn't to hide your fingerprint — it's to give everyone the same one. The hash we just computed is (mostly) the same as every other Tor user's.",
  },
  'mullvad-browser': {
    tone: 'green',
    headline: 'You look like every other Mullvad Browser user.',
    detail:
      'Same fingerprinting discipline as Tor Browser, without the onion network. Your hash should match the Mullvad crowd.',
  },
  'brave-strict': {
    tone: 'neutral',
    headline: 'Brave farbles canvas and audio — we hash around that.',
    detail:
      "This demo uses signals Brave doesn't farble: timezone, language, platform, screen, feature-support. Your hash will probably hold across your incognito windows too.",
  },
};

/** Persistent-match verdict — the hash is unchanged after the user's action. */
const PERSISTENT_BY_FAMILY: Record<BrowserFamily, Verdict> = {
  'vanilla-chrome': {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "Every signal we hashed is identical. Private windows hide history; they don't hide identity. Run the full scanner to see the 22 surfaces a real tracker would check.",
  },
  edge: {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "Edge's tracker prevention doesn't touch timezone, locale, screen, or feature-support. Clearing data only resets storage, not who you are.",
  },
  'brave-standard': {
    tone: 'red',
    headline: 'Brave Shields did not reach these signals.',
    detail:
      'Brave standard farbles canvas and audio, which we deliberately left out of this hash. Timezone, language, platform, and screen are untouched — so are you.',
  },
  'brave-strict': {
    tone: 'red',
    headline: "Brave farbling didn't reach these signals.",
    detail:
      "Strict mode randomises canvas, audio, and UA per session — we hash around all of that. Timezone, language, platform, screen dimensions, and feature-support are identical across your normal and incognito windows. A patient tracker combining those would still link you.",
  },
  'firefox-etp-standard': {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      'ETP-Standard focuses on tracker blocking, not fingerprint defences. The signals in this hash are untouched.',
  },
  'firefox-etp-strict': {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "ETP-Strict blocks tracker domains but doesn't modify the passive surfaces we hash here. Enable Fingerprinting Protection for real coverage.",
  },
  'firefox-rfp': {
    tone: 'red',
    headline: 'RFP canonicalises these signals — to the RFP bucket.',
    detail:
      "privacy.resistFingerprinting standardises timezone (UTC), locale, platform, and screen. The hash is identical for every Firefox-RFP user on this OS. That's the design: indistinguishability, not invisibility.",
  },
  librewolf: {
    tone: 'red',
    headline: 'LibreWolf stays identifiable to itself.',
    detail:
      'LibreWolf inherits RFP defaults — two visits produce the same canonicalised hash by design. You blend with other LibreWolf users, not with nobody.',
  },
  safari: {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "Safari's privacy focus is cross-site tracking, not per-site fingerprinting. The signals here are unchanged. Lockdown Mode raises the bar sharply.",
  },
  'safari-lockdown': {
    tone: 'red',
    headline: 'Even Lockdown Mode leaves these signals alone.',
    detail:
      "Lockdown Mode blocks scripts aggressively but doesn't reset your timezone, locale, platform, or screen. Those still match across sessions.",
  },
  'tor-browser': {
    tone: 'green',
    headline: 'You joined the Tor anonymity set.',
    detail:
      "You don't escape — you blend in. The hash matches every other Tor user because Tor canonicalises these signals on purpose.",
  },
  'mullvad-browser': {
    tone: 'green',
    headline: 'You joined the Mullvad Browser anonymity set.',
    detail:
      'Same as Tor from a fingerprinting angle: the hash is the same as every other Mullvad Browser user running the same build on the same OS. That is a win.',
  },
  unknown: {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "We couldn't identify your browser, but the hash is unchanged. None of the signals we checked shifted.",
  },
};

/** Drift verdict — the hash changed after the user's action. */
const DRIFT_BY_FAMILY: Record<BrowserFamily, Verdict> = {
  'vanilla-chrome': {
    tone: 'green',
    headline: 'Something in your environment changed.',
    detail:
      "At least one of the stable signals moved — probably a timezone, locale, or screen change (not a browser defense). Real trackers use many more surfaces; run the full scanner to see which ones.",
  },
  edge: {
    tone: 'green',
    headline: 'Something in your environment changed.',
    detail:
      'Whatever you did shifted a stable signal (timezone, language, screen, feature list). Edge itself did not re-randomise anything.',
  },
  'brave-standard': {
    tone: 'green',
    headline: 'Environmental drift, not Brave magic.',
    detail:
      "Brave standard doesn't randomise the signals we hash here. The drift came from something else — network, OS theme change, language swap.",
  },
  'brave-strict': {
    tone: 'green',
    headline: 'Environmental drift, not Brave farbling.',
    detail:
      "Brave farbles canvas and audio, which are NOT in this hash. The shift came from something environmental — a timezone, screen, or preference change.",
  },
  'firefox-etp-standard': {
    tone: 'green',
    headline: 'The hash drifted.',
    detail:
      'ETP-Standard rarely changes the signals we hash here, so the drift was environmental. Consider enabling Fingerprinting Protection for active defence.',
  },
  'firefox-etp-strict': {
    tone: 'green',
    headline: 'Something shifted.',
    detail:
      "ETP-Strict blocks tracker domains but doesn't re-randomise these surfaces — the drift came from an environmental change.",
  },
  'firefox-rfp': {
    tone: 'green',
    headline: 'Your Firefox-RFP hash shifted.',
    detail:
      "Unusual — RFP canonicalises most of these inputs. If the drift came from a timezone or resolution change, that explains it.",
  },
  librewolf: {
    tone: 'green',
    headline: 'The hash drifted.',
    detail:
      "LibreWolf's RFP-by-default keeps most signals constant across visits. A change here means the environment shifted.",
  },
  safari: {
    tone: 'green',
    headline: 'Your hash shifted.',
    detail:
      'Safari does not re-randomise these signals, so the drift came from the environment — OS appearance, timezone, language.',
  },
  'safari-lockdown': {
    tone: 'green',
    headline: 'Lockdown Mode + environment drift = fresh hash.',
    detail:
      'Lockdown Mode narrows the fingerprint surface; a network switch or system preference change can still shift the signals this hash uses.',
  },
  'tor-browser': {
    tone: 'green',
    headline: 'Even inside the Tor set, your hash moved.',
    detail:
      "Tor canonicalises most signals, but circuit-level timezone or resolution exposure can still drift. You're still inside the anonymity set — the drift is mostly noise.",
  },
  'mullvad-browser': {
    tone: 'green',
    headline: 'Your Mullvad hash drifted.',
    detail:
      'Mullvad canonicalises like Tor. A resolution or preference change can still shift the observable inputs.',
  },
  unknown: {
    tone: 'green',
    headline: 'Something changed.',
    detail:
      "We couldn't classify your browser, but at least one of the signals we hash shifted.",
  },
};

/** Anonymity-set framing — used when the family is Tor or Mullvad Browser. */
const ANONYMITY_BY_FAMILY: Partial<Record<BrowserFamily, Verdict>> = {
  'tor-browser': {
    tone: 'green',
    headline: 'You joined the Tor anonymity set.',
    detail:
      "You don't escape — you blend in. Tor's game is giving everyone the same fingerprint, not giving you a new one.",
  },
  'mullvad-browser': {
    tone: 'green',
    headline: 'You joined the Mullvad Browser anonymity set.',
    detail:
      "Same canonicalisation as Tor. Your hash matches every other Mullvad Browser user on the same build — that's the target state.",
  },
};

/**
 * Browser families that get the anonymity-set framing instead of raw drift.
 * Brave-strict used to be in this set but no longer: with the unified hash
 * over stable signals, Brave users typically produce a persistent match
 * across incognito, which now falls under `PERSISTENT_BY_FAMILY` with
 * honest copy about farbling not reaching these signals.
 */
const ANONYMITY_FAMILIES: ReadonlySet<BrowserFamily> = new Set<BrowserFamily>([
  'tor-browser',
  'mullvad-browser',
]);

/**
 * Resolve the verdict copy for the given family × outcome. For the
 * `anonymity-set` outcome we require an anonymity-bucket family; any other
 * family is treated as `drift` (the anonymity frame only makes sense if the
 * user is actually in one of those buckets).
 */
export function getVerdict(family: BrowserFamily, outcome: VerdictOutcome): Verdict {
  switch (outcome) {
    case 'first-visit':
      return FIRST_VISIT_BY_FAMILY[family] ?? FIRST_VISIT_DEFAULT;
    case 'persistent':
      return PERSISTENT_BY_FAMILY[family];
    case 'drift':
      return DRIFT_BY_FAMILY[family];
    case 'anonymity-set': {
      if (!ANONYMITY_FAMILIES.has(family)) {
        // Asking for anonymity framing outside the valid families is a
        // caller mistake. Fall back to the drift copy so the UI still has
        // something meaningful.
        return DRIFT_BY_FAMILY[family];
      }
      return ANONYMITY_BY_FAMILY[family] ?? DRIFT_BY_FAMILY[family];
    }
    default:
      return FIRST_VISIT_DEFAULT;
  }
}

/** Exposed for tests so we can iterate every (family, outcome) combo. */
export const ALL_FAMILIES: readonly BrowserFamily[] = [
  'vanilla-chrome',
  'edge',
  'brave-standard',
  'brave-strict',
  'firefox-etp-standard',
  'firefox-etp-strict',
  'firefox-rfp',
  'librewolf',
  'safari',
  'safari-lockdown',
  'tor-browser',
  'mullvad-browser',
  'unknown',
] as const;

export const ALL_OUTCOMES: readonly VerdictOutcome[] = [
  'first-visit',
  'persistent',
  'drift',
  'anonymity-set',
] as const;

/**
 * True if the given browser family gets anonymity-set framing on a drift
 * result. The component calls this to decide which outcome to request.
 */
export function isAnonymityBucket(family: BrowserFamily): boolean {
  return ANONYMITY_FAMILIES.has(family);
}
