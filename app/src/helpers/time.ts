/**
 * Human, relative time labels for the session history — "2m ago" reads faster
 * than "Mar 15, 14:30" for the recent sessions an operator actually cares about,
 * and only the older ones fall back to an absolute stamp.
 *
 * Pure and `now`-injected (never reads the clock itself), so the tiers are
 * deterministically testable. Purely elapsed-based — no calendar-boundary edge
 * cases — so the same wording holds in any locale/timezone; only the ≥7-day
 * fallback is locale-formatted.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Absolute fallback for entries older than a week (or dated in the future). */
const absolute = (t: number): string => {
  const d = new Date(t);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * `endedAt` → a relative label as of `now` (both epoch ms):
 *   <45s "just now" · <1h "Nm ago" · <1d "Nh ago" · <1w "Nd ago" · else absolute.
 * A future timestamp (clock skew) reads "just now" rather than a negative age.
 */
export const formatRelativeTime = (endedAt: number, now: number): string => {
  const diff = now - endedAt;
  if (diff < 45 * SECOND) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  return absolute(endedAt);
};
