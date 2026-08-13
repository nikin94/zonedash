import type { DrillSettings } from "./AppState";

/**
 * Cloud sync for the drill settings — the seam a signed-in user's device reads
 * and writes over, so a coach's tweaks (delay, immediate-repeat) follow the
 * account instead of resetting to the defaults on a reinstall / new device.
 * The concrete Supabase-backed store is a thin adapter (supabaseSettings.ts);
 * this seam and the reconcile policy below are PURE and host-tested against a
 * fake. Signed-out / offline never reaches here — settings stay device-local
 * (prefs.ts), exactly as before.
 *
 * The DrillSettings import is type-only (erased at build), so this pulls no
 * runtime dependency on AppState — same trick prefs.ts uses to avoid a cycle.
 */
export interface RemoteSettingsStore {
  /** The account's saved settings, or null when it has none yet (fresh account
   *  that never saved — the caller then seeds it). */
  load(userId: string): Promise<DrillSettings | null>;
  /** Persist the account's settings. UPSERT (insert-or-update): unlike a session
   *  row, settings are mutable, so a re-save overwrites the existing row. The
   *  Supabase adapter implements this as `insert … on conflict (user_id) do
   *  update` (see migrations/0003_create_user_settings.sql). */
  save(userId: string, settings: DrillSettings): Promise<void>;
}

/**
 * Reconcile a device's current settings with the account's cloud row on sign-in:
 *  - the account HAS saved settings → adopt them (the user's changed values win,
 *    which is the whole point — their settings follow the account);
 *  - the account has NONE yet (first sign-in) → seed it from the device's current
 *    settings and keep those, so signing in never resets a coach to the defaults.
 *
 * Pure over the injected store, so it is host-tested. Rejects if the store errors
 * (network) — the caller keeps its in-memory settings and the next sign-in
 * retries; nothing is lost (the local prefs copy is untouched).
 */
export const reconcileSettings = async (
  userId: string,
  current: DrillSettings,
  remote: RemoteSettingsStore,
): Promise<DrillSettings> => {
  const stored = await remote.load(userId);
  if (stored !== null) return stored;
  await remote.save(userId, current);
  return current;
};
