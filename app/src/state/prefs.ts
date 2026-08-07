import AsyncStorage from "@react-native-async-storage/async-storage";

import type { DrillSettings } from "./AppState";

/**
 * Durable, device-local UI preferences — the bits of AppState that should
 * outlive an app restart (unlike the link, the paired layout, or the running
 * session, which are all fresh each launch). Stored as one JSON blob under a
 * versioned key so the shape can evolve without colliding with older writes.
 *
 * This module is deliberately dumb: typed get/set of the blob, and it NEVER
 * throws — a corrupt or unavailable store must not block boot, so every path
 * falls back to "no stored prefs" and the app uses its defaults. Owning the
 * defaults is AppState's job (keeps this free of a value import from there, so
 * no runtime import cycle — the DrillSettings import is type-only).
 */
const KEY = "zonedash:prefs:v1";

export interface StoredPrefs {
  settings?: DrillSettings;
  courtRotation?: number;
}

/** Read the persisted prefs, or `{}` if none / unreadable / corrupt. */
export const loadPrefs = async (): Promise<StoredPrefs> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as StoredPrefs)
      : {};
  } catch {
    return {};
  }
};

/** Persist the prefs blob. Best-effort — a failed write just means the pref
 *  won't survive this restart, never a crash. */
export const savePrefs = async (prefs: StoredPrefs): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // swallow — persistence is a nicety, not a requirement
  }
};
