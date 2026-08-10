import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionSummary } from "../domain/session";
import type { RemoteHistoryStore } from "./sync";

/**
 * The Supabase-backed RemoteHistoryStore (sync.ts) — the cloud archive a signed-
 * in user's sessions read/write over. The type import above is erased at build,
 * so this file pulls NO supabase-js runtime and the pure mappers below are
 * host-tested; the two query methods are the thin, bench-validated glue.
 *
 * Row shape is app/supabase/migrations/0001_create_sessions.sql field for field.
 * The app's SessionSummary is camelCase; the table is snake_case, so every read
 * and write passes through rowToSummary / summaryToRow — the ONE place the two
 * naming worlds meet, kept pure so a column rename is caught by a failing test.
 */

/** A row of public.sessions (snake_case, mirrors the migration). `user_id` and
 *  `created_at` are server-owned and not part of a SessionSummary. */
export interface SessionRow {
  id: string;
  user_id: string;
  ended_at: number;
  mode: string;
  num_positions: number;
  attempts: number;
  total_ms: number;
  avg_ms: number | null;
  best_ms: number | null;
}

/** DB row → the app's SessionSummary (drops the server-owned columns). */
export const rowToSummary = (r: SessionRow): SessionSummary => ({
  id: r.id,
  endedAt: r.ended_at,
  mode: r.mode,
  numPositions: r.num_positions,
  attempts: r.attempts,
  totalMs: r.total_ms,
  avgMs: r.avg_ms,
  bestMs: r.best_ms,
});

/** SessionSummary + owning user → a DB row ready to insert. */
export const summaryToRow = (
  userId: string,
  s: SessionSummary,
): Omit<SessionRow, never> => ({
  id: s.id,
  user_id: userId,
  ended_at: s.endedAt,
  mode: s.mode,
  num_positions: s.numPositions,
  attempts: s.attempts,
  total_ms: s.totalMs,
  avg_ms: s.avgMs,
  best_ms: s.bestMs,
});

const TABLE = "sessions";

export class SupabaseRemoteHistoryStore implements RemoteHistoryStore {
  constructor(private readonly client: SupabaseClient) {}

  /** Every session the account owns, newest first (RLS already scopes the read
   *  to auth.uid(); the explicit user_id filter is defence in depth). */
  async list(userId: string): Promise<SessionSummary[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("ended_at", { ascending: false });
    if (error) throw new Error(`supabase list failed: ${error.message}`);
    return (data ?? []).map(rowToSummary);
  }

  /** Archive sessions the cloud is missing. INSERT-OR-IGNORE, never an update:
   *  sessions are immutable, so a row that already exists (same user_id, id) is
   *  a no-op — the DB invariant the schema now enforces by having NO update
   *  policy (migration 0001, review PR-A). `ignoreDuplicates` makes supabase-js
   *  emit `on conflict do nothing`. */
  async upsert(userId: string, sessions: SessionSummary[]): Promise<void> {
    if (sessions.length === 0) return; // nothing to push — skip the round trip
    const rows = sessions.map((s) => summaryToRow(userId, s));
    const { error } = await this.client
      .from(TABLE)
      .upsert(rows, { onConflict: "user_id,id", ignoreDuplicates: true });
    if (error) throw new Error(`supabase upsert failed: ${error.message}`);
  }
}
