import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionSummary } from "../domain/session";

/**
 * Durable, device-local log of finished drill sessions — the source for the
 * history view. Stored as one JSON array per identity, newest first.
 *
 * History is SCOPED BY IDENTITY: the anonymous (signed-out) log and each signed-
 * in account get their OWN bucket, so a device's anonymous runs never mix into
 * an account (or into another account) and vice-versa. `userId === null` is the
 * shared anonymous bucket (the original key, so existing local logs stay put and
 * read as anonymous); a non-null userId is that account's per-device bucket. It
 * is a trailing, defaulted arg so anonymous callers read unchanged.
 *
 * Same contract as prefs.ts: deliberately dumb and it NEVER throws. A corrupt,
 * unavailable, or wrong-shaped store falls back to an empty log so the app keeps
 * working (history is a nicety, not load-bearing). The list is capped so it
 * can't grow without bound on a device that runs drills for months.
 */
const BASE_KEY = "zonedash:history:v1";

/** The storage key for a given identity: the shared anonymous log (userId null)
 *  or a per-account bucket. Keeping the anonymous key as the base means the
 *  device's existing local log stays intact — and stays anonymous. */
const keyFor = (userId: string | null): string =>
  userId === null ? BASE_KEY : `${BASE_KEY}:user:${userId}`;

/** Keep the most recent N sessions; older ones fall off the end. */
export const HISTORY_CAP = 50;

/** Read the session log for an identity, newest first — or `[]` if none /
 *  unreadable / corrupt. Defaults to the anonymous bucket. */
export const loadHistory = async (
  userId: string | null = null,
): Promise<SessionSummary[]> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    // Only accept an array; anything else is treated as no history.
    return Array.isArray(parsed) ? (parsed as SessionSummary[]) : [];
  } catch {
    return [];
  }
};

/**
 * Prepend a finished session to the identity's bucket and persist, keeping at
 * most HISTORY_CAP entries. Returns the new list (newest first) so a caller can
 * update in-memory state without a re-read. Best-effort write — a failure just
 * means this session won't survive a restart, never a crash.
 */
export const appendSession = async (
  session: SessionSummary,
  userId: string | null = null,
): Promise<SessionSummary[]> => {
  const next = [session, ...(await loadHistory(userId))].slice(0, HISTORY_CAP);
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    // swallow — persistence is best-effort
  }
  return next;
};

/**
 * Replace an identity's whole log with `sessions` (already newest-first),
 * capped. Used by the cloud sync to persist the reconciled account+cloud view so
 * the history list reflects it on next open. Best-effort — never throws.
 */
export const replaceHistory = async (
  sessions: SessionSummary[],
  userId: string | null = null,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      keyFor(userId),
      JSON.stringify(sessions.slice(0, HISTORY_CAP)),
    );
  } catch {
    // swallow — persistence is best-effort
  }
};

/** Wipe an identity's log. Best-effort, never throws. */
export const clearHistory = async (
  userId: string | null = null,
): Promise<void> => {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // swallow
  }
};
