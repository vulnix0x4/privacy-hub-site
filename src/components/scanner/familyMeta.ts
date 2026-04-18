/**
 * Per-family display metadata for the category bar + per-section anchors.
 *
 * Icon refs are the PascalCase exports from `lucide-react`. We import each
 * icon individually in the consumer component so the bundler tree-shakes the
 * rest of the library.
 */
import type { VectorFamily } from '../../lib/scanner/types';

export interface FamilyMeta {
  id: VectorFamily;
  label: string;
  anchor: string;
  subtitle: string;
}

export const FAMILY_META: readonly FamilyMeta[] = [
  {
    id: 'network',
    label: 'Network',
    anchor: 'network',
    subtitle: 'What every HTTP server sees before you render a pixel.',
  },
  {
    id: 'fingerprint',
    label: 'Fingerprint',
    anchor: 'fingerprint',
    subtitle: 'Rendering, hardware, and locale details hashed into a near-unique ID.',
  },
  {
    id: 'sensors',
    label: 'Sensors',
    anchor: 'sensors',
    subtitle: 'Physical readings surfaced to JavaScript without a prompt.',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    anchor: 'permissions',
    subtitle: 'The silent Permissions API bitmap — the shape is the fingerprint.',
  },
  {
    id: 'storage',
    label: 'Storage',
    anchor: 'storage',
    subtitle: 'What the browser will hand a third-party script and how long it lingers.',
  },
  {
    id: 'behavioral',
    label: 'Behavioral',
    anchor: 'behavioral',
    subtitle: 'Signals from what you\'ve installed or how you interact.',
  },
  {
    id: 'cross-site',
    label: 'Cross-site',
    anchor: 'cross-site',
    subtitle: 'Linkage across origins and the cookies every CDN drops on you.',
  },
];
