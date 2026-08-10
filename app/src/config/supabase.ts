/**
 * Supabase connection config, read from Expo public env vars (inlined at build
 * time, like EXPO_PUBLIC_BLE). Returns null when unset — the app then stays
 * LOCAL-ONLY (state/history.ts), exactly as it works today, and never reaches
 * the cloud path. So a build without these vars is a fully working offline app.
 *
 * The publishable (public) key is meant to ship in the client: every table
 * enables RLS with policies pinned to auth.uid(), so the key can only read/write
 * the signed-in user's own rows, never across accounts
 * (supabase/migrations/0001_*.sql, supabase/README.md). The secret key and DB
 * password stay server-side. ("publishable" is Supabase's current key system,
 * the `sb_publishable_…` replacement for the legacy `anon` JWT.)
 */
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/** The env config, or null when either var is missing (→ local-only app). */
export const getSupabaseConfig = (): SupabaseConfig | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Both must be present and non-empty; a half-set config is treated as unset so
  // the app degrades to local-only rather than constructing a broken client.
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
};
