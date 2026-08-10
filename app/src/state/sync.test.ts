import type { SessionSummary } from "../domain/session";
import { HISTORY_CAP } from "./history";
import { mergeSessions, type RemoteHistoryStore, syncHistory } from "./sync";

// A session with only the fields the merge cares about (id/endedAt) varying.
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

// A RemoteHistoryStore test double: an in-memory bag keyed by id, recording
// every upsert so a test can assert what got pushed.
class FakeRemote implements RemoteHistoryStore {
  rows = new Map<string, SessionSummary>();
  upserts: SessionSummary[][] = [];
  failList: string | null = null;

  seed(sessions: SessionSummary[]): this {
    for (const s of sessions) this.rows.set(s.id, s);
    return this;
  }
  async list(): Promise<SessionSummary[]> {
    if (this.failList) throw new Error(this.failList);
    return [...this.rows.values()];
  }
  async upsert(_userId: string, sessions: SessionSummary[]): Promise<void> {
    this.upserts.push(sessions);
    for (const s of sessions) this.rows.set(s.id, s);
  }
}

const ids = (list: SessionSummary[]) => list.map((s) => s.id);

describe("mergeSessions", () => {
  test("unions both sides, newest first", () => {
    const merged = mergeSessions([sess(3), sess(1)], [sess(2)]);
    expect(ids(merged)).toEqual(["3", "2", "1"]);
  });

  test("de-dupes a shared id (immutable rows) — no double entry", () => {
    const merged = mergeSessions([sess(2), sess(1)], [sess(2)]);
    expect(ids(merged)).toEqual(["2", "1"]);
  });

  test("empty on both sides is empty", () => {
    expect(mergeSessions([], [])).toEqual([]);
  });
});

describe("syncHistory", () => {
  test("first-login migration: empty cloud → every local session is pushed up", async () => {
    const remote = new FakeRemote();
    const local = [sess(3), sess(2), sess(1)];

    const merged = await syncHistory("u1", local, remote);

    // All three archived to the cloud, and the merged view is the local log.
    expect(ids(remote.upserts[0])).toEqual(["3", "2", "1"]);
    expect(ids([...remote.rows.values()]).sort()).toEqual(["1", "2", "3"]);
    expect(ids(merged)).toEqual(["3", "2", "1"]);
  });

  test("pushes only the sessions the cloud is missing, and pulls the ones it has", async () => {
    // Cloud already has 2 (from another device); this device has 3 and 1.
    const remote = new FakeRemote().seed([sess(2)]);
    const local = [sess(3), sess(1)];

    const merged = await syncHistory("u1", local, remote);

    // Only the cloud-missing locals (3, 1) are pushed — not the already-present 2.
    expect(ids(remote.upserts[0]).sort()).toEqual(["1", "3"]);
    // Merged view carries the other device's session (2) too, newest first.
    expect(ids(merged)).toEqual(["3", "2", "1"]);
  });

  test("nothing to push when the cloud already has every local session", async () => {
    const remote = new FakeRemote().seed([sess(2), sess(1)]);
    const merged = await syncHistory("u1", [sess(1)], remote);
    expect(remote.upserts).toHaveLength(0); // no upsert call at all
    expect(ids(merged)).toEqual(["2", "1"]);
  });

  test("caps the returned view for the local list, newest first", async () => {
    const remote = new FakeRemote();
    // More than the cap, split across local and (pretend) cloud.
    const local = Array.from({ length: HISTORY_CAP + 10 }, (_, i) => sess(i + 1));
    const merged = await syncHistory("u1", local, remote);
    expect(merged).toHaveLength(HISTORY_CAP);
    expect(merged[0].id).toBe(String(HISTORY_CAP + 10)); // newest first
  });

  test("a store failure rejects — the caller keeps local state and retries", async () => {
    const remote = new FakeRemote();
    remote.failList = "network down";
    await expect(syncHistory("u1", [sess(1)], remote)).rejects.toThrow("network down");
  });
});
