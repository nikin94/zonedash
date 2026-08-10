import type { AuthEvent } from "./auth";
import { MockAuthProvider } from "./auth.mock";

test("starts signed-out — the app's default, no backend", () => {
  const auth = new MockAuthProvider();
  expect(auth.status).toBe("signed-out");
  expect(auth.user).toBeNull();
});

test("Google sign-in walks signing-in → signed-in and emits both, with a user", async () => {
  const auth = new MockAuthProvider();
  const events: AuthEvent[] = [];
  auth.onAuthChange((e) => events.push(e));

  await auth.signInWithGoogle();

  expect(events.map((e) => e.status)).toEqual(["signing-in", "signed-in"]);
  expect(auth.status).toBe("signed-in");
  expect(auth.user).toEqual({
    id: "mock-user",
    email: "tester@zonedash.dev",
    name: "Tester",
  });
});

test("a failed sign-in returns to signed-out with a reason, and rejects", async () => {
  const auth = new MockAuthProvider({ failSignIn: true });
  const events: AuthEvent[] = [];
  auth.onAuthChange((e) => events.push(e));

  await expect(auth.signInWithGoogle()).rejects.toThrow("sign-in cancelled");
  expect(auth.status).toBe("signed-out");
  expect(auth.user).toBeNull();
  expect(events.at(-1)).toMatchObject({ status: "signed-out", reason: /cancelled/ });
});

test("sign-out returns to local-only and emits signed-out", async () => {
  const auth = new MockAuthProvider();
  await auth.signInWithGoogle();
  const events: AuthEvent[] = [];
  auth.onAuthChange((e) => events.push(e));

  await auth.signOut();

  expect(auth.status).toBe("signed-out");
  expect(auth.user).toBeNull();
  expect(events.at(-1)).toEqual({ status: "signed-out", user: null, reason: undefined });
});

test("a custom account is what sign-in resolves to", async () => {
  const auth = new MockAuthProvider({
    user: { id: "u42", email: "a@b.c", name: "Ada" },
  });
  await auth.signInWithGoogle();
  expect(auth.user).toMatchObject({ id: "u42", name: "Ada" });
});
