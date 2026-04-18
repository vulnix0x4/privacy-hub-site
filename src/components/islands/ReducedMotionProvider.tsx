import { MotionConfig, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Wraps any React island that uses Motion. Respects the user's
 * `prefers-reduced-motion` setting globally: when set to "reduce,"
 * all Motion transitions become instantaneous and layout animations
 * are disabled. Paired with our CSS rule in `src/styles/global.css`
 * that disables CSS animations and `scroll-behavior` for the same
 * media query.
 */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const prefersReduce = useReducedMotion();
  return (
    <MotionConfig
      reducedMotion={prefersReduce ? 'always' : 'never'}
      transition={{ duration: prefersReduce ? 0 : 0.2, ease: 'easeOut' }}
    >
      {children}
    </MotionConfig>
  );
}

export default ReducedMotionProvider;
