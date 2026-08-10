import type { SessionSummary } from "../domain/session";
import { HISTORY_CAP } from "./history";

/**
 * Cloud sync for the session history — the seam a signed-in user's device syncs
 * over, and the merge policy that reconciles the device-local log (history.ts)
 * with the cloud rows (supabase/migrations/0001_create_sessions.sql).
 *
 * The whole reconciliation is PURE and host-tested against a fake store; the
 * concrete Supabase-backed RemoteHistoryStore is a thin adapter written in PR-B.
 * Signed-out / offline never reaches here — history stays purely local, exactly
 * as it works today.
 */

/** The cloud archive of a user's sessions. Implemented over Supabase in PR-B. */
export interface RemoteHistoryStore {
  /** Every session the account has, any order (the caller sorts). */
  list(userId: string): Promise<SessionSummary[]>;
  /**
   * Archive sessions for the account. INSERT-OR-IGNORE, never update: a row
   * whose id already exists is left untouched (finished sessions are immutable,
   * enforced by the schema having no update policy — see
   * migrations/0001_create_sessions.sql). This is what makes a re-push
   * idempotent on id, so a retry after a partial sync can't corrupt an archived
   * row. The Supabase adapter (PR-B) implements this as
   * `insert … on conflict (user_id, id) do nothing`.
   */
  upsert(userId: string, sessions: SessionSummary[]): Promise<void>;
}

/**
 * Merge two session lists into one, newest first. Union by `id`; on a shared id
 * the later `endedAt` wins (last-write-wins). A finished session is immutable
 * and its id IS its endedAt, so a shared id means identical content — LWW is a
 * formal tiebreaker that in practice never diverges, but it keeps the merge
 * total and order-independent regardless of which side a row came from.
 */
export const mergeSessions = (
  a: SessionSummary[],
  b: SessionSummary[],
): SessionSummary[] => {
  const byId = new Map<string, SessionSummary>();
  for (const s of [...a, ...b]) {
    const prev = byId.get(s.id);
    if (prev === undefined || s.endedAt > prev.endedAt) byId.set(s.id, s);
  }
  return [...byId.values()].sort((x, y) => y.endedAt - x.endedAt);
};

/**
 * Reconcile a device's local history with the account's cloud archive:
 *  1. pull the account's cloud sessions,
 *  2. push up every LOCAL session the cloud doesn't have yet (uncapped — the
 *     cloud is the durable archive, so nothing is dropped there),
 *  3. return the merged list, newest first, capped to `cap` for the local view.
 *
 * This same call is the first-login migration: a fresh account's cloud is empty,
 * so every local session is pushed up and the merged result is just the local
 * log. Rejects if the store errors (network) — the caller keeps its local state
 * and retries; nothing is lost because the push is idempotent on id.
 */
export const syncHistory = async (
  userId: string,
  local: SessionSummary[],
  remote: RemoteHistoryStore,
  cap: number = HISTORY_CAP,
): Promise<SessionSummary[]> => {
  const pulled = await remote.list(userId);
  const remoteIds = new Set(pulled.map((s) => s.id));
  const toPush = local.filter((s) => !remoteIds.has(s.id));
  if (toPush.length > 0) await remote.upsert(userId, toPush);
  return mergeSessions(local, pulled).slice(0, cap);
};
