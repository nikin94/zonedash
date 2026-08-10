import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseConfig } from "../config/supabase";

/**
 * The one board-dependent module of the accounts stack — it actually talks to
 * Supabase over the network, so like BlePlxPeripheral it is validated at the
 * bench (a configured build), not in jest. Nothing above it is coupled to
 * supabase-js: the auth seam (AuthProvider) and the data seam (RemoteHistory-
 * Store) are pure interfaces, host-tested against fakes; this constructs the
 * concrete client they run over.
 *
 * It is imported ONLY when a SupabaseConfig exists (getSupabaseConfig() != null),
 * so a local-only build never pulls the client — the same lazy pattern as the
 * BLE transport. The `url-polyfill/auto` import is required: supabase-js needs a
 * spec-complete URL/URLSearchParams, which React Native lacks by default.
 */
export const createSupabaseClient = (cfg: SupabaseConfig): SupabaseClient =>
  createClient(cfg.url, cfg.publishableKey, {
    auth: {
      // Persist the session across restarts in the same store history uses.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No browser redirect flow — we sign in with a native Google id token
      // (PR-C), so there is never an OAuth callback URL to parse.
      detectSessionInUrl: false,
    },
  });
