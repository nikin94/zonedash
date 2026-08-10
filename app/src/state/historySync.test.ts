import type { SessionSummary } from "../domain/session";
import { reconcileHistory, type HistorySyncIO } from "./historySync";
import type { RemoteHistoryStore } from "./sync";

const sess = (endedAt: number, over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: String(endedAt),
  endedAt,
  mode: "random",
  numPositions: 6,
  attempts: 3,
  totalMs: 1200,
  avgMs: 400,
  bestMs: 300,
  ...over,
});

class FakeRemote implements RemoteHistoryStore {
  rows = new Map<string, SessionSummary>();
  upserts: SessionSummary[][] = [];
  failList: string | null = null;
  seed(s: SessionSummary[]): this {
    for (const x of s) this.rows.set(x.id, x);
    return this;
  }
  async list(): Promise<SessionSummary[]> {
    if (this.failList) throw new Error(this.failList);
    return [...this.rows.values()];
  }
  async upsert(_u: string, s: SessionSummary[]): Promise<void> {
    this.upserts.push(s);
    for (const x of s) if (!this.rows.has(x.id)) this.rows.set(x.id, x); // insert-or-ignore
  }
}

// An in-memory local store standing in for history.ts.
const fakeIO = (initial: SessionSummary[]): HistorySyncIO & { store: SessionSummary[] } => {
  const io = {
    store: [...initial],
    load: async () => io.store,
    replace: async (s: SessionSummary[]) => {
      io.store = s;
    },
  };
  return io;
};

const ids = (l: SessionSummary[]) => l.map((s) => s.id);

test("first sign-in migrates local history up and persists the merged view", async () => {
  const remote = new FakeRemote(); // empty cloud
  const io = fakeIO([sess(3), sess(2), sess(1)]);

  const merged = await reconcileHistory("u1", remote, io);

  expect(ids(remote.upserts[0])).toEqual(["3", "2", "1"]); // all pushed up
  expect(ids(merged)).toEqual(["3", "2", "1"]);
  expect(ids(io.store)).toEqual(["3", "2", "1"]); // persisted locally
});

test("merges the account's other-device sessions into the local store", async () => {
  const remote = new FakeRemote().seed([sess(2)]); // another device's session
  const io = fakeIO([sess(3), sess(1)]);

  const merged = await reconcileHistory("u1", remote, io);

  expect(ids(remote.upserts[0]).sort()).toEqual(["1", "3"]); // only cloud-missing pushed
  expect(ids(merged)).toEqual(["3", "2", "1"]); // cloud's 2 folded in
  expect(ids(io.store)).toEqual(["3", "2", "1"]);
});

test("a remote failure leaves the local store untouched and rejects", async () => {
  const remote = new FakeRemote();
  remote.failList = "network down";
  const io = fakeIO([sess(1)]);

  await expect(reconcileHistory("u1", remote, io)).rejects.toThrow("network down");
  expect(ids(io.store)).toEqual(["1"]); // never replaced
});
