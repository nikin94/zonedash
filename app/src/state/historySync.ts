import type { SessionSummary } from "../domain/session";
import { loadHistory, replaceHistory } from "./history";
import { type RemoteHistoryStore, syncHistory } from "./sync";

/**
 * Sign-in reconciliation: when a user signs in, merge the device-local history
 * (history.ts) with their cloud archive and persist the merged view locally so
 * the history modal reflects both this device and the others the account has
 * used. This is also the first-login migration — a fresh account's cloud is
 * empty, so every local session is pushed up (see syncHistory).
 *
 * The orchestration is PURE over injected IO (load/replace) and the abstract
 * RemoteHistoryStore, so it is host-tested against fakes; the defaults are the
 * real device-local store. Rejects if the remote errors (network) — the local
 * store is left untouched and the caller can retry, losing nothing because the
 * push is idempotent on id.
 */
export interface HistorySyncIO {
  load: () => Promise<SessionSummary[]>;
  replace: (sessions: SessionSummary[]) => Promise<void>;
}

const DEFAULT_IO: HistorySyncIO = { load: loadHistory, replace: replaceHistory };

export const reconcileHistory = async (
  userId: string,
  remote: RemoteHistoryStore,
  io: HistorySyncIO = DEFAULT_IO,
): Promise<SessionSummary[]> => {
  const local = await io.load();
  const merged = await syncHistory(userId, local, remote);
  await io.replace(merged);
  return merged;
};
