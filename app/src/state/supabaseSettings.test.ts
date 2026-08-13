import type { SupabaseClient } from "@supabase/supabase-js";

import type { DrillSettings } from "./AppState";
import {
  rowToSettings,
  type SettingsRow,
  settingsToRow,
  SupabaseRemoteSettingsStore,
} from "./supabaseSettings";

const settings = (over: Partial<DrillSettings> = {}): DrillSettings => ({
  mode: "path",
  stopBy: "time",
  count: 15,
  durationMs: 45000,
  delayMs: 1500,
  allowImmediateRepeat: true,
  ...over,
});

const row = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  user_id: "u1",
  mode: "path",
  stop_by: "time",
  count: 15,
  duration_ms: 45000,
  delay_ms: 1500,
  allow_immediate_repeat: true,
  ...over,
});

describe("row mappers", () => {
  test("settingsToRow tags the owner and snake-cases every field", () => {
    expect(settingsToRow("u1", settings())).toEqual(row());
  });

  test("rowToSettings drops the owner column and camel-cases", () => {
    const s = rowToSettings(row());
    expect(s).toEqual(settings());
    expect(s).not.toHaveProperty("user_id");
  });

  test("a false/zero value survives the round trip", () => {
    const off = settings({ delayMs: 0, allowImmediateRepeat: false });
    expect(rowToSettings(settingsToRow("u1", off))).toEqual(off);
  });
});

// A minimal Supabase client double: records the query the store builds and
// resolves the shape supabase-js returns ({ data, error } / { error }).
class FakeSupabase {
  row: SettingsRow | null = null;
  loadError: string | null = null;
  saveError: string | null = null;
  lastEq: { col: string; val: string } | null = null;
  lastUpsert: { row: SettingsRow; opts: unknown } | null = null;

  seed(r: SettingsRow | null): this {
    this.row = r;
    return this;
  }

  from() {
    const self = this;
    const builder = {
      select: () => builder,
      eq(col: string, val: string) {
        self.lastEq = { col, val };
        return builder;
      },
      // maybeSingle resolves to a single row or null (never an error for "no
      // row") — the awaited end of a read chain.
      maybeSingle() {
        return Promise.resolve(
          self.loadError
            ? { data: null, error: { message: self.loadError } }
            : { data: self.row, error: null },
        );
      },
      upsert(r: SettingsRow, opts: unknown) {
        self.lastUpsert = { row: r, opts };
        return {
          then: (
            resolve: (v: { error: { message: string } | null }) => unknown,
          ) =>
            Promise.resolve(
              self.saveError
                ? { error: { message: self.saveError } }
                : { error: null },
            ).then(resolve),
        };
      },
    };
    return builder;
  }
}

const store = (fake: FakeSupabase) =>
  new SupabaseRemoteSettingsStore(fake as unknown as SupabaseClient);

describe("SupabaseRemoteSettingsStore", () => {
  test("load returns null when the account has no settings row", async () => {
    const fake = new FakeSupabase().seed(null);
    expect(await store(fake).load("u1")).toBeNull();
    expect(fake.lastEq).toEqual({ col: "user_id", val: "u1" }); // scoped to the user
  });

  test("load maps the account's row to DrillSettings", async () => {
    const fake = new FakeSupabase().seed(row({ delay_ms: 800 }));
    expect(await store(fake).load("u1")).toEqual(settings({ delayMs: 800 }));
  });

  test("save upserts on the user_id key (insert-or-update, not ignore)", async () => {
    const fake = new FakeSupabase();
    await store(fake).save("u1", settings({ delayMs: 2000 }));
    expect(fake.lastUpsert?.opts).toEqual({ onConflict: "user_id" });
    expect(fake.lastUpsert?.row).toEqual(row({ delay_ms: 2000 }));
  });

  test("a load error rejects with the store's message", async () => {
    const fake = new FakeSupabase();
    fake.loadError = "denied";
    await expect(store(fake).load("u1")).rejects.toThrow(
      /supabase settings load failed: denied/,
    );
  });

  test("a save error rejects with the store's message", async () => {
    const fake = new FakeSupabase();
    fake.saveError = "denied";
    await expect(store(fake).save("u1", settings())).rejects.toThrow(
      /supabase settings save failed: denied/,
    );
  });
});
