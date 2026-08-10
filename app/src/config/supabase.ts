/**
 * Supabase connection config, read from Expo public env vars (inlined at build
 * time, like EXPO_PUBLIC_BLE). Returns null when unset — the app then stays
 * LOCAL-ONLY (state/history.ts), exactly as it works today, and never reaches
 * the cloud path. So a build without these vars is a fully working offline app.
 *
 * The anon (public) key is meant to ship in the client: every table enables RLS
 * with policies pinned to auth.uid(), so the key can only read/write the signed-
 * in user's own rows, never across accounts (supabase/migrations/0001_*.sql,
 * supabase/README.md). The service-role key and DB password stay server-side.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** The env config, or null when either var is missing (→ local-only app). */
export const getSupabaseConfig = (): SupabaseConfig | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  // Both must be present and non-empty; a half-set config is treated as unset so
  // the app degrades to local-only rather than constructing a broken client.
  if (!url || !anonKey) return null;
  return { url, anonKey };
};
