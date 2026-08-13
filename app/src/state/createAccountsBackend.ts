import { getGoogleConfig } from "../config/google";
import { getSupabaseConfig } from "../config/supabase";
import type { AuthProvider } from "./auth";
import { MockAuthProvider } from "./auth.mock";
import type { RemoteSettingsStore } from "./settings";
import type { RemoteHistoryStore } from "./sync";

/**
 * The accounts backend picked at app start — the auth provider and the cloud
 * history store, built from ONE Supabase client so the store's reads/writes ride
 * the authenticated session's JWT that RLS scopes by. Same seam boundary as
 * createTransport: nothing above it is coupled to supabase-js or the native
 * Google SDK.
 *
 * The real backend needs BOTH the Supabase config (url + publishable key) AND
 * the Google web client id; missing either, the app falls back to the mock
 * provider and no cloud store — a fully working, signed-out, local-only app,
 * exactly today's behaviour. The concrete modules are require()'d lazily inside
 * the opt-in branch, so a local-only / test build never pulls supabase-js or
 * google-signin.
 */
export interface AccountsBackend {
  auth: AuthProvider;
  /** The cloud archive to reconcile local history against, or null local-only. */
  remoteHistory: RemoteHistoryStore | null;
  /** The cloud settings row a signed-in user's drill settings sync over, or null
   *  local-only. */
  remoteSettings: RemoteSettingsStore | null;
}

export const createAccountsBackend = (): AccountsBackend => {
  const supabase = getSupabaseConfig();
  const google = getGoogleConfig();
  if (supabase && google) {
    const { createSupabaseClient } =
      require("./supabaseClient") as typeof import("./supabaseClient");
    const { SupabaseAuthProvider } =
      require("./SupabaseAuthProvider") as typeof import("./SupabaseAuthProvider");
    const { SupabaseRemoteHistoryStore } =
      require("./supabaseHistory") as typeof import("./supabaseHistory");
    const { SupabaseRemoteSettingsStore } =
      require("./supabaseSettings") as typeof import("./supabaseSettings");
    const client = createSupabaseClient(supabase);
    return {
      auth: new SupabaseAuthProvider(client, google),
      remoteHistory: new SupabaseRemoteHistoryStore(client),
      remoteSettings: new SupabaseRemoteSettingsStore(client),
    };
  }
  return {
    auth: new MockAuthProvider(),
    remoteHistory: null,
    remoteSettings: null,
  };
};
