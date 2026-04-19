/**
 * Ghost Demo verdict copy — keyed by {@link BrowserFamily} × {@link VerdictOutcome}.
 *
 * After a visitor runs a "Try to hide" action, we re-hash their environment
 * and classify the result. The copy here is what the UI shows. Voice mirrors
 * design-doc §2.1: direct, opinionated, no clickbait. The Tor/Mullvad and
 * Brave-strict branches frame success as "you joined a crowd," not "you
 * escaped" — that's the correct threat model.
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
    tone: 'green',
    headline: 'Brave farbling just shifted your fingerprint.',
    detail:
      "Every load Brave randomises the signals that make you unique. Reload — the hash will change, because that's the point.",
  },
};

/** Persistent-match verdict — the hash is unchanged after the user's action. */
const PERSISTENT_BY_FAMILY: Record<BrowserFamily, Verdict> = {
  'vanilla-chrome': {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "6 of 6 inputs unchanged. Private windows hide history; they don't hide identity. Run the full scanner to see the 22 surfaces a real tracker would check.",
  },
  edge: {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "Edge's tracker prevention doesn't touch the signals in this hash. Clearing data only resets storage, not your rendering pipeline.",
  },
  'brave-standard': {
    tone: 'red',
    headline: 'Same hash — farbling alone was not enough.',
    detail:
      'Brave Shields in standard mode farble audio and canvas at a per-session granularity — same session, same hash. Switch to Strict for per-origin randomisation.',
  },
  'brave-strict': {
    tone: 'red',
    headline: 'Strict mode and the hash still matched.',
    detail:
      "Unusual — Brave-strict usually re-farbles canvas/audio on every load. Either the farbling didn't fire or some other input (fonts, UA) is dominating your hash.",
  },
  'firefox-etp-standard': {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "ETP-Standard focuses on tracker blocking, not fingerprint defences. Your canvas/audio/fonts sail through unchanged. Try privacy.resistFingerprinting in about:config.",
  },
  'firefox-etp-strict': {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "ETP-Strict adds known fingerprinter domain blocking, but doesn't touch the passive surfaces in this hash. Enable Fingerprinting Protection for real coverage.",
  },
  'firefox-rfp': {
    tone: 'red',
    headline: 'RFP is on, but the hash matched anyway.',
    detail:
      "privacy.resistFingerprinting canonicalises most of these signals — if the hash is identical across visits, it's probably identical for every Firefox-RFP user. That's the design: indistinguishability, not invisibility.",
  },
  librewolf: {
    tone: 'red',
    headline: 'LibreWolf stayed identifiable to itself.',
    detail:
      'LibreWolf inherits RFP defaults — two visits in the same LibreWolf build produce the same canonicalised hash by design. You blend with other LibreWolf users, not with nobody.',
  },
  safari: {
    tone: 'red',
    headline: "They still know it's you.",
    detail:
      "Safari's privacy features focus on cross-site tracking, not per-site fingerprinting. Your rendering signature is unchanged. Lockdown Mode raises the bar sharply.",
  },
  'safari-lockdown': {
    tone: 'red',
    headline: 'Even Lockdown Mode kept the same hash.',
    detail:
      "Lockdown Mode blocks scripts aggressively but some of the inputs we hash (UA, screen, timezone) don't require JS to observe. The baseline is narrower but still not empty.",
  },
  'tor-browser': {
    tone: 'green',
    headline: 'You joined the Tor anonymity set.',
    detail:
      "You don't escape — you blend in. The hash matches every other Tor user's because Tor canonicalises these signals on purpose.",
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
      "We couldn't identify your browser family, but the hash is unchanged either way. That means none of the inputs shifted.",
  },
};

/** Drift verdict — the hash changed after the user's action. */
const DRIFT_BY_FAMILY: Record<BrowserFamily, Verdict> = {
  'vanilla-chrome': {
    tone: 'green',
    headline: 'Your defense worked.',
    detail:
      "At least one signal shifted. A tracker using only this 6-input hash would see a stranger. Real trackers use more surfaces — run the full scanner to see which ones.",
  },
  edge: {
    tone: 'green',
    headline: 'Your defense worked.',
    detail:
      'Something in your environment changed after the action — a different network, a new canvas surface, a fresh font list. The hash drifted.',
  },
  'brave-standard': {
    tone: 'green',
    headline: 'Brave farbling did its job.',
    detail:
      'Standard mode farbles per-session — new session, new farble, new hash. Strict mode would also farble per-origin.',
  },
  'brave-strict': {
    tone: 'green',
    headline: 'Brave is doing its job.',
    detail:
      'Every signal shifted — a tracker would think you were a different person. This is the strict-mode farbling surface working as designed.',
  },
  'firefox-etp-standard': {
    tone: 'green',
    headline: 'The hash drifted.',
    detail:
      'ETP-Standard rarely changes the signals we hash here, so whatever moved was environmental (network, VPN, hardware clock). Consider enabling Fingerprinting Protection for active defence.',
  },
  'firefox-etp-strict': {
    tone: 'green',
    headline: 'Something changed.',
    detail:
      "ETP-Strict blocks tracker domains but doesn't re-randomise these surfaces — the drift came from an environmental shift, not Firefox itself.",
  },
  'firefox-rfp': {
    tone: 'green',
    headline: 'Your Firefox-RFP hash shifted.',
    detail:
      'Unusual — RFP canonicalises most of these inputs. If the drift came from a timezone or IP change (VPN, network hop), that explains it. RFP canonicalises timezone to UTC only when asked.',
  },
  librewolf: {
    tone: 'green',
    headline: 'The hash drifted.',
    detail:
      "LibreWolf's RFP-by-default keeps most signals constant across visits. A change here means the environment shifted, not the browser.",
  },
  safari: {
    tone: 'green',
    headline: 'Your hash shifted.',
    detail:
      "Safari's canvas/audio are normalised but not identical across visits; a VPN, network, or timezone change is the most likely cause.",
  },
  'safari-lockdown': {
    tone: 'green',
    headline: 'Lockdown Mode + environment drift = fresh hash.',
    detail:
      "Lockdown Mode narrows the fingerprint surface; combine it with a network switch and you look like a different visitor to most of the inputs in this hash.",
  },
  'tor-browser': {
    tone: 'green',
    headline: 'Even inside the Tor set, your hash moved.',
    detail:
      "Tor canonicalises most signals, but the circuit-level IP and timezone exposure can still drift. You're still inside the anonymity set — the drift here is mostly noise from our side.",
  },
  'mullvad-browser': {
    tone: 'green',
    headline: 'Your Mullvad hash drifted.',
    detail:
      'Mullvad Browser canonicalises like Tor but runs over your normal network. A VPN or wifi change can still shift the observable inputs.',
  },
  unknown: {
    tone: 'green',
    headline: 'Your defense worked.',
    detail:
      "Something in the hash moved. We couldn't classify your browser, but the result is the same: from a 6-input tracker's view, you're a different person now.",
  },
};

/**
 * Resilient-persistent verdict — the strict hash drifted (farbling worked!)
 * but the resilient hash (timezone + language + platform + screen) held, so a
 * sophisticated tracker combining those would still link the sessions. This
 * is the "farbling is not enough" moment on Brave incognito specifically.
 */
const RESILIENT_PERSISTENT_BY_FAMILY: Record<BrowserFamily, Verdict> = {
  'vanilla-chrome': {
    tone: 'red',
    headline: 'Some signals drifted, some didn\u2019t.',
    detail:
      'Canvas, audio, or UA moved — but timezone, language, platform, and screen dimensions are identical. A tracker using those would still link you.',
  },
  edge: {
    tone: 'red',
    headline: 'Some signals drifted, some didn\u2019t.',
    detail:
      'Whatever you did shifted the rendering-level signals, but the OS + locale surface is unchanged. A tracker using those still has you.',
  },
  'brave-standard': {
    tone: 'red',
    headline: 'Brave farbling worked \u2014 and the fall-back still linked you.',
    detail:
      'Canvas/audio/UA shifted (good). But timezone, language, platform, and screen size are identical across sessions. A tracker combining those would still re-identify you.',
  },
  'brave-strict': {
    tone: 'red',
    headline: 'Brave farbling worked \u2014 network + locale signals still linked you.',
    detail:
      "Strict mode did its job on canvas, audio, and UA. The catch: timezone, language, platform, and screen dimensions don't change between your normal and incognito windows. A patient tracker combining those would still link the two sessions back together.",
  },
  'firefox-etp-standard': {
    tone: 'red',
    headline: 'The rendering surface moved, the rest didn\u2019t.',
    detail:
      'Canvas or audio shifted (probably environmental) but the stable signals \u2014 timezone, language, platform, screen \u2014 match. A sophisticated tracker would still link you.',
  },
  'firefox-etp-strict': {
    tone: 'red',
    headline: 'Part of your fingerprint drifted, part held.',
    detail:
      "Whatever shifted moved the canvas/audio/UA inputs but left the OS + locale surface alone. That surface is enough for correlation if a tracker is looking for it.",
  },
  'firefox-rfp': {
    tone: 'red',
    headline: 'RFP did its job on rendering \u2014 locale signals still match.',
    detail:
      "RFP canonicalises canvas, audio, fonts, and UA. Timezone, language, platform, and screen remain your real ones. Combining those, a tracker can still link your sessions.",
  },
  librewolf: {
    tone: 'red',
    headline: 'LibreWolf RFP canonicalised the rendering \u2014 but not the locale.',
    detail:
      'Canvas/audio/UA are now the LibreWolf-RFP canonical. Your timezone, language, platform, and screen are still yours, and they match across sessions.',
  },
  safari: {
    tone: 'red',
    headline: 'Safari shifted some inputs \u2014 the rest still link you.',
    detail:
      "Safari's fingerprint defences narrowed the rendering surface, but timezone/language/platform/screen are identical across normal and private windows.",
  },
  'safari-lockdown': {
    tone: 'red',
    headline: 'Even Lockdown Mode leaves the locale surface intact.',
    detail:
      "Lockdown Mode blocks a lot of fingerprint-surface scripts, but it doesn't reset your timezone, language, platform, or screen dimensions. Those still match across sessions.",
  },
  'tor-browser': {
    tone: 'green',
    headline: 'You joined the Tor anonymity set.',
    detail:
      "On Tor the resilient signals are canonicalised too (timezone \u2192 UTC, language \u2192 en-US, platform \u2192 Win32). The hash matches because every Tor user has the same one.",
  },
  'mullvad-browser': {
    tone: 'green',
    headline: 'You joined the Mullvad Browser anonymity set.',
    detail:
      'Mullvad canonicalises the locale surface like Tor. Your resilient hash matches the other Mullvad users on this build.',
  },
  unknown: {
    tone: 'red',
    headline: 'Part of your fingerprint moved, part held.',
    detail:
      "Rendering-level signals shifted. Timezone, language, platform, and screen are still the same — a tracker correlating those would still link you.",
  },
};

/** Anonymity-set framing — used when the family is Tor, Mullvad, or Brave-strict. */
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
  'brave-strict': {
    tone: 'green',
    headline: 'Brave is doing its job.',
    detail:
      'Every signal shifted — a tracker would think you were a different person. Strict-mode farbling re-randomises on every origin and every load.',
  },
};

/** Browser families that get the anonymity-set framing instead of raw drift. */
const ANONYMITY_FAMILIES: ReadonlySet<BrowserFamily> = new Set<BrowserFamily>([
  'tor-browser',
  'mullvad-browser',
  'brave-strict',
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
    case 'resilient-persistent':
      return RESILIENT_PERSISTENT_BY_FAMILY[family];
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
  'resilient-persistent',
  'anonymity-set',
] as const;

/**
 * True if the given browser family gets anonymity-set framing on a drift
 * result. The component calls this to decide which outcome to request.
 */
export function isAnonymityBucket(family: BrowserFamily): boolean {
  return ANONYMITY_FAMILIES.has(family);
}
