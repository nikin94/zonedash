/**
 * How many trailing step numbers a court badge shows before older ones elide.
 * A spot reused across many steps would otherwise grow a label that overflows
 * the dot and clips its LATEST steps — the ones the operator just added and is
 * looking at. Showing the last few (with a leading ellipsis) keeps the newest
 * visible instead.
 */
export const BADGE_MAX_STEPS = 2;

/**
 * Format a spot's step ordinals into its court-badge label. All steps join with
 * "·" while they fit; past BADGE_MAX_STEPS the OLDEST are dropped to a leading
 * "…" so the most recent stay on screen (e.g. [1, 3, 5, 7] → "…5·7"). An empty
 * set is null — no badge.
 */
export const formatStepBadge = (steps: number[]): string | null => {
  if (steps.length === 0) return null;
  if (steps.length <= BADGE_MAX_STEPS) return steps.join("·");
  return `…${steps.slice(-BADGE_MAX_STEPS).join("·")}`;
};
