import type { HitRecord } from "../ble/contract";

/**
 * A finished drill session, distilled to the numbers worth keeping between
 * launches — the row a history list shows. Derived from the session's hit
 * records at completion; the per-attempt detail is NOT stored (it lives only in
 * the live results panel), so a summary stays small and a capped history is cheap.
 */
export interface SessionSummary {
  /** Stable id — the completion timestamp in epoch ms (also `endedAt`). */
  id: string;
  /** When the session finished, epoch ms. */
  endedAt: number;
  /** The drill mode that ran: "random" | "path" | "live" (the UI mode label). */
  mode: string;
  /** Active targets the drill ran over. */
  numPositions: number;
  /** Resolved attempts this session (the records count). */
  attempts: number;
  /** Sum of reaction times, ms. */
  totalMs: number;
  /** Mean reaction over the attempts, or null when there were none. */
  avgMs: number | null;
  /** Fastest reaction, or null when there were no attempts. */
  bestMs: number | null;
}

/** Metadata the records don't carry — supplied by the panel at completion. */
export interface SummaryMeta {
  endedAt: number;
  mode: string;
  numPositions: number;
}

/**
 * Fold a session's hit records into a SessionSummary. Pure — the same
 * derivation the live results panel shows (total / average), plus the best
 * reaction, so history and the just-finished panel never disagree. `avgMs` /
 * `bestMs` are null for an empty set rather than 0, so "no attempts" reads
 * distinctly from "0.00 s".
 */
export const summarize = (
  records: HitRecord[],
  meta: SummaryMeta,
): SessionSummary => {
  const totalMs = records.reduce((s, r) => s + r.reactionMs, 0);
  const avgMs = records.length > 0 ? totalMs / records.length : null;
  const bestMs =
    records.length > 0
      ? records.reduce((m, r) => Math.min(m, r.reactionMs), Infinity)
      : null;
  return {
    id: String(meta.endedAt),
    endedAt: meta.endedAt,
    mode: meta.mode,
    numPositions: meta.numPositions,
    attempts: records.length,
    totalMs,
    avgMs,
    bestMs,
  };
};

/**
 * The id of the session with the fastest average reaction — the personal best a
 * history list badges, so progression reads at a glance. Only meaningful as a
 * comparison, so it returns null unless at least TWO sessions have an average to
 * compare (a lone session isn't "the best of" anything). Sessions with no
 * attempts (null avg) are ignored. Ties keep the first (newest, since history is
 * newest-first) so the badge doesn't hop between equal runs.
 */
export const bestAverageSessionId = (
  sessions: SessionSummary[],
): string | null => {
  const scored = sessions.filter((s): s is SessionSummary & { avgMs: number } => s.avgMs !== null);
  if (scored.length < 2) return null;
  return scored.reduce((best, s) => (s.avgMs < best.avgMs ? s : best)).id;
};
