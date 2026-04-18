/**
 * Presentation metadata for every DefenseMode + the scanner-specific
 * `pending-backend` sentinel (the three stub probes that wait on the Phase-3
 * scanner backend). One map so `ScannerCard`, `ScannerHero`, and any future
 * share-PNG generator agree on labels and token colours.
 *
 * Colour uses Tailwind v4 design tokens from `src/styles/global.css` — never
 * hardcode hex here. Adding a token? Extend `@theme` first.
 */
import type { DefenseMode } from '../../lib/scanner/types';

export type BadgeKey = DefenseMode | 'pending-backend';

export interface BadgeConfig {
  label: string;
  /** Tailwind classes for the badge background/border/text. */
  className: string;
  /** Single-char for motion-reduce or ultra-compact share artifacts. */
  glyph: string;
}

export const BADGE_CONFIG: Record<BadgeKey, BadgeConfig> = {
  UNCHANGED: {
    label: 'Tracked',
    className:
      'bg-state-unchanged/15 text-state-unchanged border border-state-unchanged/40',
    glyph: '!',
  },
  SPOOFED: {
    label: 'Spoofed',
    className:
      'bg-state-spoofed/15 text-state-spoofed border border-state-spoofed/40',
    glyph: 'S',
  },
  FARBLED: {
    label: 'Farbled',
    className:
      'bg-state-farbled/15 text-state-farbled border border-state-farbled/40',
    glyph: 'F',
  },
  QUANTIZED: {
    label: 'Quantized',
    className:
      'bg-state-quantized/15 text-state-quantized border border-state-quantized/40',
    glyph: 'Q',
  },
  BLOCKED: {
    label: 'Blocked — nice',
    className:
      'bg-state-blocked/15 text-state-blocked border border-state-blocked/40',
    glyph: 'B',
  },
  'INFO-PUBLIC': {
    label: 'Public',
    className:
      'bg-state-info/15 text-state-info border border-state-info/40',
    glyph: 'i',
  },
  'INFO-CONTEXT': {
    label: 'Info',
    className:
      'bg-state-info/15 text-state-info border border-state-info/40',
    glyph: 'i',
  },
  'pending-backend': {
    label: 'Pending — backend',
    className:
      'bg-state-info/10 text-state-info border border-state-info/30',
    glyph: '…',
  },
};

/**
 * Family pill colour — network/fingerprint/etc. get a subtle accent that
 * parallels the design-doc index. Keeps the cards visually grouped without
 * redundant family headers above every one.
 */
export const FAMILY_PILL_CLASS: Record<string, string> = {
  network: 'bg-surface-raised text-text-muted border border-white/10',
  fingerprint: 'bg-surface-raised text-text-muted border border-white/10',
  sensors: 'bg-surface-raised text-text-muted border border-white/10',
  permissions: 'bg-surface-raised text-text-muted border border-white/10',
  storage: 'bg-surface-raised text-text-muted border border-white/10',
  behavioral: 'bg-surface-raised text-text-muted border border-white/10',
  'cross-site': 'bg-surface-raised text-text-muted border border-white/10',
};
