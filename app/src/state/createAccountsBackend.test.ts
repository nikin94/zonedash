import { MockAuthProvider } from "./auth.mock";
import { createAccountsBackend } from "./createAccountsBackend";

// With no Supabase / Google env vars (the jest + Expo Go default), the factory
// must take the local-only branch — a signed-out mock provider and no cloud
// store — and pull NO supabase-js / google-signin. The configured branch is
// on-device-validated (network + native SDK), so it is not exercised here; the
// point under test is that an unconfigured build degrades to a working local-
// only app rather than constructing a broken client.
test("no backend config → mock auth, no cloud store, signed-out", () => {
  const backend = createAccountsBackend();
  expect(backend.auth).toBeInstanceOf(MockAuthProvider);
  expect(backend.auth.status).toBe("signed-out");
  expect(backend.remoteHistory).toBeNull();
});
