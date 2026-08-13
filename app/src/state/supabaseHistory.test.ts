import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionSummary } from "../domain/session";
import {
  rowToSummary,
  type SessionRow,
  SupabaseRemoteHistoryStore,
  summaryToRow,
} from "./supabaseHistory";

const summary = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: "1700",
  endedAt: 1700,
  mode: "random",
  numPositions: 6,
  attempts: 3,
  totalMs: 1200,
  avgMs: 400,
  bestMs: 300,
  ...over,
});

const row = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "1700",
  user_id: "u1",
  ended_at: 1700,
  mode: "random",
  num_positions: 6,
  attempts: 3,
  total_ms: 1200,
  avg_ms: 400,
  best_ms: 300,
  player_name: null,
  ...over,
});

describe("row mappers", () => {
  test("summaryToRow tags the owner and snake-cases every field", () => {
    expect(summaryToRow("u1", summary())).toEqual(row());
  });

  test("rowToSummary drops server-owned columns and camel-cases", () => {
    const s = rowToSummary(row({ user_id: "u1" }));
    expect(s).toEqual(summary());
    expect(s).not.toHaveProperty("user_id");
    expect(s).not.toHaveProperty("created_at");
  });

  test("null avg/best (no attempts) survive the round trip, not coerced to 0", () => {
    const empty = summary({
      attempts: 0,
      totalMs: 0,
      avgMs: null,
      bestMs: null,
    });
    expect(rowToSummary(summaryToRow("u1", empty))).toEqual(empty);
  });

  test("a set player name round-trips; an unnamed run stores null and omits the key", () => {
    // Named: the name persists as a column value and comes back on the summary.
    const named = summary({ playerName: "Alex" });
    expect(summaryToRow("u1", named).player_name).toBe("Alex");
    expect(rowToSummary(summaryToRow("u1", named))).toEqual(named);

    // Unnamed: written as an explicit null, mapped back to an OMITTED key (not
    // `playerName: undefined`) so it compares equal to a summarize()'d run.
    expect(summaryToRow("u1", summary()).player_name).toBeNull();
    const back = rowToSummary(row({ player_name: null }));
    expect(back).not.toHaveProperty("playerName");
  });
});

// A minimal Supabase client double: records the query the store builds and
// resolves the shape supabase-js returns ({ data, error } / { error }).
class FakeSupabase {
  rows: SessionRow[] = [];
  listError: string | null = null;
  upsertError: string | null = null;
  lastEq: { col: string; val: string } | null = null;
  lastUpsert: { rows: SessionRow[]; opts: unknown } | null = null;

  seed(rows: SessionRow[]): this {
    this.rows = rows;
    return this;
  }

  from() {
    const self = this;
    const builder = {
      select: () => builder,
      order: () => builder,
      eq(col: string, val: string) {
        self.lastEq = { col, val };
        return builder;
      },
      then(
        resolve: (r: {
          data: SessionRow[] | null;
          error: { message: string } | null;
        }) => unknown,
      ) {
        return Promise.resolve(
          self.listError
            ? { data: null, error: { message: self.listError } }
            : { data: self.rows, error: null },
        ).then(resolve);
      },
      upsert(rows: SessionRow[], opts: unknown) {
        self.lastUpsert = { rows, opts };
        return {
          then: (
            resolve: (r: { error: { message: string } | null }) => unknown,
          ) =>
            Promise.resolve(
              self.upsertError
                ? { error: { message: self.upsertError } }
                : { error: null },
            ).then(resolve),
        };
      },
    };
    return builder;
  }
}

const store = (fake: FakeSupabase) =>
  new SupabaseRemoteHistoryStore(fake as unknown as SupabaseClient);

describe("SupabaseRemoteHistoryStore", () => {
  test("list scopes to the user and maps rows to summaries", async () => {
    const fake = new FakeSupabase().seed([row({ id: "2" }), row({ id: "1" })]);
    const out = await store(fake).list("u1");

    expect(fake.lastEq).toEqual({ col: "user_id", val: "u1" });
    expect(out.map((s) => s.id)).toEqual(["2", "1"]);
    expect(out[0]).not.toHaveProperty("user_id"); // mapped, not raw rows
  });

  test("upsert tags the owner and uses insert-or-ignore (never an update)", async () => {
    const fake = new FakeSupabase();
    await store(fake).upsert("u1", [
      summary({ id: "1" }),
      summary({ id: "2" }),
    ]);

    expect(fake.lastUpsert?.opts).toEqual({
      onConflict: "user_id,id",
      ignoreDuplicates: true, // immutable rows — a conflicting id is a no-op
    });
    expect(fake.lastUpsert?.rows.map((r) => r.user_id)).toEqual(["u1", "u1"]);
    expect(fake.lastUpsert?.rows.map((r) => r.id)).toEqual(["1", "2"]);
  });

  test("an empty push is a no-op — no round trip", async () => {
    const fake = new FakeSupabase();
    await store(fake).upsert("u1", []);
    expect(fake.lastUpsert).toBeNull();
  });

  test("a list error rejects with the store's message", async () => {
    const fake = new FakeSupabase();
    fake.listError = "network down";
    await expect(store(fake).list("u1")).rejects.toThrow(
      /supabase list failed: network down/,
    );
  });

  test("an upsert error rejects with the store's message", async () => {
    const fake = new FakeSupabase();
    fake.upsertError = "denied";
    await expect(store(fake).upsert("u1", [summary()])).rejects.toThrow(
      /supabase upsert failed: denied/,
    );
  });
});
