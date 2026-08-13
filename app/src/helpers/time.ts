/**
 * Absolute session-time labels for the history list. An operator wants the real
 * clock time of a run, not a relative "2m ago": today shows just the time, the
 * previous calendar day reads "yesterday", and anything older falls back to a
 * plain dd.mm.yyyy date.
 *
 * Pure and `now`-injected (never reads the clock itself), so the tiers are
 * deterministically testable. Calendar-day based (local time) — the today /
 * yesterday split flips at local midnight, not on elapsed hours.
 */

const DAY = 24 * 60 * 60 * 1000;

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local midnight (00:00) of the day containing epoch-ms `t`. */
const startOfDay = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * `endedAt` → an absolute label as of `now` (both epoch ms):
 *   today → "HH:MM" (24h) · yesterday → "yesterday" · older → "dd.mm.yyyy".
 * A future timestamp (clock skew) counts as today, so it reads as a time.
 */
export const formatSessionTime = (endedAt: number, now: number): string => {
  const d = new Date(endedAt);
  const days = Math.round((startOfDay(now) - startOfDay(endedAt)) / DAY);
  if (days <= 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 1) return "yesterday";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/**
 * A duration in ms → a compact seconds label with NO space before the unit
 * ("0.82s", "30s"). Times read slitno app-wide (reaction times, the drill-length
 * caption, history averages) so there is one formatter for all of them; hit
 * COUNTS keep their space ("10 hits") and are formatted separately.
 * `decimals` sets the fractional digits — 2 for reaction times, 0 for the whole
 * seconds of the drill-length caption.
 */
export const formatSeconds = (ms: number, decimals = 2): string =>
  `${(ms / 1000).toFixed(decimals)}s`;
