import type { SessionSummary } from "../domain/session";
import { loadHistory, replaceHistory } from "./history";
import { type RemoteHistoryStore, syncHistory } from "./sync";

/**
 * Sign-in reconciliation: when a user signs in, merge THIS ACCOUNT's device-local
 * bucket (history.ts, scoped to the userId) with their cloud archive and persist
 * the merged view back into that same account bucket — so the history list
 * reflects both this device and the others the account has used.
 *
 * It reconciles the ACCOUNT'S bucket, never the anonymous one: a device's
 * signed-out runs are a separate history and are deliberately left out of the
 * account (they were never attributed to it). A fresh account's cloud is empty,
 * so this is also the account's first-device migration — its local bucket (empty
 * on a brand-new device) is pushed up (see syncHistory).
 *
 * The orchestration is PURE over injected IO (load/replace) and the abstract
 * RemoteHistoryStore, so it is host-tested against fakes; the defaults bind the
 * real device-local store SCOPED TO the account bucket. Rejects if the remote
 * errors (network) — the local store is left untouched and the caller can retry,
 * losing nothing because the push is idempotent on id.
 */
export interface HistorySyncIO {
  load: () => Promise<SessionSummary[]>;
  replace: (sessions: SessionSummary[]) => Promise<void>;
}

export const reconcileHistory = async (
  userId: string,
  remote: RemoteHistoryStore,
  // Defaults scope the device-local store to THIS account's bucket, so a
  // reconcile never reads or writes the anonymous log.
  io: HistorySyncIO = {
    load: () => loadHistory(userId),
    replace: (sessions) => replaceHistory(sessions, userId),
  },
): Promise<SessionSummary[]> => {
  const local = await io.load();
  const merged = await syncHistory(userId, local, remote);
  await io.replace(merged);
  return merged;
};
