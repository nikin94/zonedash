import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionSummary } from "../domain/session";

/**
 * Durable, device-local log of finished drill sessions — the source for the
 * history view. Stored as one JSON array under a versioned key, newest first.
 *
 * Same contract as prefs.ts: deliberately dumb and it NEVER throws. A corrupt,
 * unavailable, or wrong-shaped store falls back to an empty log so the app keeps
 * working (history is a nicety, not load-bearing). The list is capped so it
 * can't grow without bound on a device that runs drills for months.
 */
const KEY = "zonedash:history:v1";

/** Keep the most recent N sessions; older ones fall off the end. */
export const HISTORY_CAP = 50;

/** Read the session log, newest first — or `[]` if none / unreadable / corrupt. */
export const loadHistory = async (): Promise<SessionSummary[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    // Only accept an array; anything else is treated as no history.
    return Array.isArray(parsed) ? (parsed as SessionSummary[]) : [];
  } catch {
    return [];
  }
};

/**
 * Prepend a finished session and persist, keeping at most HISTORY_CAP entries.
 * Returns the new list (newest first) so a caller can update in-memory state
 * without a re-read. Best-effort write — a failure just means this session
 * won't survive a restart, never a crash.
 */
export const appendSession = async (
  session: SessionSummary,
): Promise<SessionSummary[]> => {
  const next = [session, ...(await loadHistory())].slice(0, HISTORY_CAP);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // swallow — persistence is best-effort
  }
  return next;
};

/**
 * Replace the whole log with `sessions` (already newest-first), capped. Used by
 * the cloud sync to persist the reconciled local+cloud view so the history modal
 * reflects it on next open. Best-effort — a failed write never throws.
 */
export const replaceHistory = async (
  sessions: SessionSummary[],
): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sessions.slice(0, HISTORY_CAP)));
  } catch {
    // swallow — persistence is best-effort
  }
};

/** Wipe the log. Best-effort, never throws. */
export const clearHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // swallow
  }
};
