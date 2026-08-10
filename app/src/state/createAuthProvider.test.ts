import { createAuthProvider } from "./createAuthProvider";

test("defaults to a signed-out provider — the app runs local-only with no backend", () => {
  const auth = createAuthProvider();
  expect(auth.status).toBe("signed-out");
  expect(auth.user).toBeNull();
  // The seam is honoured: the default provider exposes the full AuthProvider API.
  expect(typeof auth.signInWithGoogle).toBe("function");
  expect(typeof auth.signOut).toBe("function");
  expect(typeof auth.onAuthChange).toBe("function");
});
