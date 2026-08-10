import { getSupabaseConfig } from "./supabase";

const URL_KEY = "EXPO_PUBLIC_SUPABASE_URL";
const KEY_KEY = "EXPO_PUBLIC_SUPABASE_ANON_KEY";

// Save/restore the two env vars around each test so the process env is pristine.
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved[URL_KEY] = process.env[URL_KEY];
  saved[KEY_KEY] = process.env[KEY_KEY];
  delete process.env[URL_KEY];
  delete process.env[KEY_KEY];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("both vars set → returns the config", () => {
  process.env[URL_KEY] = "https://proj.supabase.co";
  process.env[KEY_KEY] = "anon-key-123";
  expect(getSupabaseConfig()).toEqual({
    url: "https://proj.supabase.co",
    anonKey: "anon-key-123",
  });
});

test("either var missing → null (app stays local-only)", () => {
  expect(getSupabaseConfig()).toBeNull(); // neither set

  process.env[URL_KEY] = "https://proj.supabase.co";
  expect(getSupabaseConfig()).toBeNull(); // key missing

  delete process.env[URL_KEY];
  process.env[KEY_KEY] = "anon-key-123";
  expect(getSupabaseConfig()).toBeNull(); // url missing
});

test("an empty string counts as unset — no broken client", () => {
  process.env[URL_KEY] = "";
  process.env[KEY_KEY] = "anon-key-123";
  expect(getSupabaseConfig()).toBeNull();
});
