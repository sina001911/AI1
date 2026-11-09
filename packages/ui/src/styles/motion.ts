/**
 * Shared motion presets for `motion/react`.
 *
 * These mirror the CSS tokens in `tokens/motion.css` so components can pick a
 * preset by name instead of inlining duration/ease values. Keep the two in
 * sync: every preset here must have a matching CSS variable.
 */

export const MOTION_DURATION = {
  fast: 0.1,
  base: 0.2,
  md: 0.3,
  slow: 0.42,
  xslow: 0.9
} as const

export const MOTION_EASE = {
  InOut: 'easeInOut',
  Out: 'easeOut',
  Queue: [0.23, 1, 0.32, 1]
} as const

/** Standard slide-and-fade used by shell panes and overlays. */
export const MOTION_TRANSITION = {
  duration: MOTION_DURATION.md,
  ease: MOTION_EASE.InOut
} as const

/** Longer restore transition for panes that travel across the layout. */
export const MOTION_RESTORE_TRANSITION = {
  duration: MOTION_DURATION.slow,
  ease: MOTION_EASE.InOut
} as const

/** Queue-style easing for composer dock follow-ups. */
export const MOTION_QUEUE_TRANSITION = {
  duration: MOTION_DURATION.base,
  ease: MOTION_EASE.Queue
} as const

/** Instant transition — used while a user is actively dragging or resizing. */
export const MOTION_INSTANT_TRANSITION = { duration: 0 } as const
