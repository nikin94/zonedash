import type {
  AuthEvent,
  AuthProvider,
  AuthStatus,
  AuthUser,
  Unsubscribe,
} from "./auth";

export interface MockAuthOptions {
  /** The user a Google sign-in resolves to. Defaults to a stub tester. */
  user?: AuthUser;
  /** Make signInWithGoogle reject (cancelled / failed) instead of succeeding. */
  failSignIn?: boolean;
  /** Latency before a sign-in settles, ms (0 in tests). */
  latencyMs?: number;
}

const DEFAULT_USER: AuthUser = {
  id: "mock-user",
  email: "tester@zonedash.dev",
  name: "Tester",
};

/**
 * In-app AuthProvider double — the app's default until SupabaseAuthProvider
 * lands, and the test double for the sync/UI layers. Starts signed-out (the
 * real default), so an app on the mock behaves exactly like a signed-out real
 * app: local-only, no backend. signInWithGoogle flips to a stub account.
 */
export class MockAuthProvider implements AuthProvider {
  status: AuthStatus = "signed-out";
  user: AuthUser | null = null;

  private readonly account: AuthUser;
  // Mutable so a test can flip a failing provider to succeed on retry.
  failSignIn: boolean;
  private readonly latencyMs: number;
  private listeners = new Set<(e: AuthEvent) => void>();

  constructor(opts: MockAuthOptions = {}) {
    this.account = opts.user ?? DEFAULT_USER;
    this.failSignIn = opts.failSignIn ?? false;
    this.latencyMs = opts.latencyMs ?? 0;
  }

  async signInWithGoogle(): Promise<void> {
    // Already signed in, or a sign-in already in flight → no-op. Guarding
    // "signing-in" too keeps a double-tap (or the real provider's seconds of
    // network) from re-emitting signing-in and racing a second attempt.
    if (this.status === "signed-in" || this.status === "signing-in") return;
    this.setState("signing-in", null);
    await this.wait();
    if (this.failSignIn) {
      this.setState("signed-out", null, "mock: sign-in cancelled");
      throw new Error("sign-in cancelled");
    }
    this.setState("signed-in", this.account);
  }

  async signOut(): Promise<void> {
    if (this.status === "signed-out") return;
    this.setState("signed-out", null);
  }

  onAuthChange(listener: (event: AuthEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── internals ──────────────────────────────────────────
  private setState(status: AuthStatus, user: AuthUser | null, reason?: string) {
    this.status = status;
    this.user = user;
    const event: AuthEvent = { status, user, reason };
    this.listeners.forEach((l) => l(event));
  }

  private wait(): Promise<void> {
    return this.latencyMs > 0
      ? new Promise((r) => setTimeout(r, this.latencyMs))
      : Promise.resolve();
  }
}
