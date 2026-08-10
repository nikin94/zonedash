/**
 * Auth seam between the app and whatever backs accounts — the same shape the
 * BLE transport uses (CentralTransport): the UI only ever talks to this
 * interface, and implementations wire it onto a real service.
 *  - MockAuthProvider (auth.mock.ts) — in-app double, the default until the real
 *    provider lands; drives tests and lets the app run signed-out with no backend.
 *  - SupabaseAuthProvider (later, PR-B) — @supabase/supabase-js, Google sign-in
 *    via a native id token (no browser round-trip).
 *
 * Auth is OPTIONAL by design: signed-out is a first-class state (local-only
 * history, exactly today's behaviour), so nothing here is load-bearing — a user
 * who never signs in gets the full app off the device-local store.
 */

/** The signed-in user, as much as the app needs — never a full profile. */
export interface AuthUser {
  /** Stable account id (the Supabase Auth uid). The owner key for cloud rows. */
  id: string;
  email: string | null;
  /** Display name, when the provider gives one (Google does). */
  name: string | null;
}

export type AuthStatus =
  | "signed-out" // no account — local-only; the app's default
  | "signing-in" // sign-in in flight
  | "signed-in"; // an account is active

/** Emitted on every auth transition — the UI re-renders account state off it,
 *  and the sync layer keys sign-in/sign-out on it. */
export interface AuthEvent {
  status: AuthStatus;
  user: AuthUser | null;
  /** Failure cause when a sign-in ends back at signed-out. */
  reason?: string;
}

export type Unsubscribe = () => void;

export interface AuthProvider {
  /** Current status, readable for a freshly-mounted screen (same rehydrate
   *  reason as CentralTransport.connectionState). */
  readonly status: AuthStatus;
  /** The active user, or null when signed-out. */
  readonly user: AuthUser | null;

  /** Sign in with Google. Resolves once signed-in (status → signed-in), rejects
   *  and returns to signed-out on cancel/failure. The concrete provider uses a
   *  NATIVE id token, so there is no browser hand-off. */
  signInWithGoogle(): Promise<void>;
  /** Sign out — back to local-only. Idempotent. */
  signOut(): Promise<void>;

  /** Subscribe to auth transitions; the returned fn unsubscribes. */
  onAuthChange(listener: (event: AuthEvent) => void): Unsubscribe;
}
