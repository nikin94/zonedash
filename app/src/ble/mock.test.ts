/** Tests for the mock central unit behind the CentralTransport seam. */
import { MockCentralTransport } from "./mock";
import type { StatusEvent } from "./transport";

// Zero latency + fake timers: every simulated delay is stepped explicitly.
const make = () =>
  new MockCentralTransport({ latencyMs: 0, stepMs: 100, missEvery: 3 });

const record = (t: MockCentralTransport) => {
  const events: StatusEvent[] = [];
  t.onStatus((e) => events.push(e));
  return events;
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("connect lifecycle emits connecting then connected", async () => {
  const t = make();
  const events = record(t);

  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  expect(t.connectionState).toBe("connected");
  const states = events
    .filter((e) => e.kind === "connection")
    .map((e) => (e as { state: string }).state);
  expect(states).toEqual(["connecting", "connected"]);
});

test("commands reject while disconnected", async () => {
  const t = make();
  await expect(t.startSession()).rejects.toThrow("not connected");
  await expect(t.startPairing(4)).rejects.toThrow("not connected");
});

test("pairing walks each slot then reports done", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.startPairing(3);
  await jest.runAllTimersAsync();

  const prompts = events
    .filter((e) => e.kind === "pairing")
    .map((e) => (e as { progress: { currentPrompt: number } }).progress.currentPrompt);
  expect(prompts).toEqual([0, 1, 2, -1]);

  // After the round the session returns to idle with all targets online.
  const last = events.filter((e) => e.kind === "session").pop();
  expect(last).toMatchObject({ state: "idle", targetsOnline: 3 });
});

test("a session produces hit records and finishes", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.loadDrill({ mode: "random", numPositions: 4, count: 6, timeoutMs: 1000 });
  await t.startSession();
  await jest.runAllTimersAsync();

  const dump = t.dumpResults();
  await jest.runAllTimersAsync();
  const hits = await dump;

  expect(hits).toHaveLength(6);
  // missEvery=3 → seq 2 and 5 are timeout misses carrying the timeout value.
  expect(hits.filter((h) => h.miss).map((h) => h.seq)).toEqual([2, 5]);
  expect(hits[2]).toMatchObject({ tHitUs: 0, reactionMs: 1000 });
  // Real hits land inside the layout and carry positive reactions.
  for (const h of hits.filter((h) => !h.miss)) {
    expect(h.position).toBeGreaterThanOrEqual(0);
    expect(h.position).toBeLessThan(4);
    expect(h.reactionMs).toBeGreaterThan(0);
  }
  const last = events.filter((e) => e.kind === "session").pop();
  expect(last).toMatchObject({ state: "done" });
});

test("stopSession aborts a running drill and keeps recorded hits", async () => {
  const t = make();
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.loadDrill({ mode: "random", numPositions: 4, count: 10 });
  await t.startSession();
  await jest.advanceTimersByTimeAsync(250); // ~3 steps of 100 ms

  await t.stopSession();
  await jest.runAllTimersAsync(); // no further steps may fire

  const dump = t.dumpResults();
  await jest.runAllTimersAsync();
  const hits = await dump;
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.length).toBeLessThan(10);
});

test("path mode follows the authored sequence", async () => {
  const t = make();
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.loadDrill({ mode: "path", numPositions: 6, path: [2, 0, 5] });
  await t.startSession();
  await jest.runAllTimersAsync();

  const dump = t.dumpResults();
  await jest.runAllTimersAsync();
  const hits = await dump;
  expect(hits.map((h) => h.position)).toEqual([2, 0, 5]);
});
