import type { AuthProvider } from "./auth";
import { MockAuthProvider } from "./auth.mock";

/**
 * Pick the auth provider at app start — the same seam boundary as
 * createTransport. Default = MockAuthProvider, so Expo Go and the jest suite run
 * with no backend and the app is fully usable signed-out (local-only history).
 *
 * When Supabase is configured (getSupabaseConfig() != null), the real
 * SupabaseAuthProvider is require()'d lazily inside the opt-in branch — never at
 * module load — so @supabase/supabase-js is only pulled in by a configured
 * build, keeping the mock/test path free of it. The concrete provider (Google
 * via a native id token) lands in PR-C; until then a configured build still gets
 * the mock, which is signed-out and harmless.
 */
export const createAuthProvider = (): AuthProvider => {
  // PR-C wires the real provider here:
  //   const cfg = getSupabaseConfig();
  //   if (cfg) { const { SupabaseAuthProvider } = require("./SupabaseAuthProvider");
  //             return new SupabaseAuthProvider(cfg); }
  return new MockAuthProvider();
};
