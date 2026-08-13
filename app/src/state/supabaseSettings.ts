import type { SupabaseClient } from "@supabase/supabase-js";

import type { DrillSettings } from "./AppState";
import type { RemoteSettingsStore } from "./settings";

/**
 * The Supabase-backed RemoteSettingsStore (settings.ts) — the cloud row a signed-
 * in user's drill settings read/write over. The type imports above are erased at
 * build, so this file pulls NO supabase-js runtime and the pure mappers below are
 * host-tested; the two query methods are the thin, bench-validated glue.
 *
 * Row shape is app/supabase/migrations/0003_create_user_settings.sql field for
 * field. DrillSettings is camelCase; the table is snake_case, so every read and
 * write passes through rowToSettings / settingsToRow — the ONE place the two
 * naming worlds meet, kept pure so a column rename is caught by a failing test.
 */

/** A row of public.user_settings (snake_case, mirrors the migration). `user_id`
 *  and `updated_at` are server-owned and not part of DrillSettings. */
export interface SettingsRow {
  user_id: string;
  delay_ms: number;
  allow_immediate_repeat: boolean;
}

/** DB row → the app's DrillSettings (drops the server-owned columns). */
export const rowToSettings = (r: SettingsRow): DrillSettings => ({
  delayMs: r.delay_ms,
  allowImmediateRepeat: r.allow_immediate_repeat,
});

/** DrillSettings + owning user → a DB row ready to upsert. */
export const settingsToRow = (
  userId: string,
  s: DrillSettings,
): SettingsRow => ({
  user_id: userId,
  delay_ms: s.delayMs,
  allow_immediate_repeat: s.allowImmediateRepeat,
});

const TABLE = "user_settings";

export class SupabaseRemoteSettingsStore implements RemoteSettingsStore {
  constructor(private readonly client: SupabaseClient) {}

  /** The account's settings row, or null when it has none yet (RLS already
   *  scopes the read to auth.uid(); the explicit user_id filter is defence in
   *  depth). `maybeSingle` returns null data — not an error — for no row. */
  async load(userId: string): Promise<DrillSettings | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error)
      throw new Error(`supabase settings load failed: ${error.message}`);
    return data ? rowToSettings(data as SettingsRow) : null;
  }

  /** Persist the account's settings. UPSERT on the user_id primary key: a row
   *  that already exists is UPDATED (settings are mutable — the one difference
   *  from the immutable sessions table). `ignoreDuplicates` defaults to false,
   *  so supabase-js emits `on conflict (user_id) do update`. */
  async save(userId: string, settings: DrillSettings): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .upsert(settingsToRow(userId, settings), { onConflict: "user_id" });
    if (error)
      throw new Error(`supabase settings save failed: ${error.message}`);
  }
}
