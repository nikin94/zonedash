import { Platform } from "react-native";

import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import type { GoogleConfig } from "../config/google";
import type {
  AuthEvent,
  AuthProvider,
  AuthStatus,
  AuthUser,
  Unsubscribe,
} from "./auth";

/**
 * The real AuthProvider — Supabase Auth signed into with a NATIVE Google id
 * token (no browser hand-off), the flow the seam (auth.ts) was shaped for. Like
 * BlePlxPeripheral / SupabaseRemoteHistoryStore it is the board-dependent tip of
 * the stack: it touches the native Google SDK and the network, so it is
 * validated on-device (a configured build), not in jest — nothing above the
 * seam imports it, and createAccountsBackend require()s it lazily only when
 * Supabase + Google are configured, so the mock/test path never pulls it.
 *
 * Sign-in: the native SDK returns a Google id token, which Supabase exchanges
 * for a session (`signInWithIdToken`); Supabase's own onAuthStateChange is the
 * source of truth for status, so a restored session (persistSession) rehydrates
 * the account with no extra work. The same Supabase client backs the history
 * store (createAccountsBackend), so its authenticated JWT is what RLS scopes
 * cloud rows by.
 */
export class SupabaseAuthProvider implements AuthProvider {
  status: AuthStatus = "signed-out";
  user: AuthUser | null = null;

  private listeners = new Set<(e: AuthEvent) => void>();

  constructor(
    private readonly client: SupabaseClient,
    google: GoogleConfig,
  ) {
    // One-time native SDK setup. webClientId is the id-token audience Supabase
    // validates; iosClientId lets the iOS SDK present the picker.
    GoogleSignin.configure({
      webClientId: google.webClientId,
      iosClientId: google.iosClientId ?? undefined,
    });

    // Supabase is the source of truth: this fires once on subscribe with the
    // current (possibly restored) session, then on every transition — so a
    // persisted session rehydrates the account without an explicit getSession.
    this.client.auth.onAuthStateChange((_event, session) => {
      this.adopt(session);
    });
  }

  async signInWithGoogle(): Promise<void> {
    // In-flight / already-signed-in guard — a second tap can't start a parallel
    // walk (the same guard the mock and BLE connect() carry).
    if (this.status !== "signed-out") return;
    this.setState("signing-in", this.user);
    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices();
      }
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        // The user dismissed the picker — back to signed-out, no error surfaced.
        this.setState("signed-out", null, "sign-in cancelled");
        return;
      }
      const idToken = response.data.idToken;
      if (!idToken) throw new Error("no id token from Google");

      const { error } = await this.client.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      if (error) throw error;
      // Success flips status via onAuthStateChange (SIGNED_IN → adopt()).
    } catch (e) {
      const reason = e instanceof Error ? e.message : "sign-in failed";
      this.setState("signed-out", null, reason);
      throw e instanceof Error ? e : new Error(reason);
    }
  }

  async signOut(): Promise<void> {
    if (this.status === "signed-out") return;
    // Best-effort native sign-out; Supabase's signOut is what clears the seam
    // (via onAuthStateChange → SIGNED_OUT).
    await GoogleSignin.signOut().catch(() => {});
    await this.client.auth.signOut();
  }

  onAuthChange(listener: (event: AuthEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── internals ──────────────────────────────────────────
  /** Reconcile the seam with a Supabase session (null = signed-out). */
  private adopt(session: Session | null): void {
    if (session) {
      this.setState("signed-in", toAuthUser(session));
    } else {
      this.setState("signed-out", null);
    }
  }

  private setState(status: AuthStatus, user: AuthUser | null, reason?: string) {
    this.status = status;
    this.user = user;
    const event: AuthEvent = { status, user, reason };
    this.listeners.forEach((l) => l(event));
  }
}

/** Supabase session → the app's AuthUser (only the fields the app needs). */
const toAuthUser = (session: Session): AuthUser => {
  const u = session.user;
  const meta = u.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null;
  return { id: u.id, email: u.email ?? null, name };
};
