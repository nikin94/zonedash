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
  await expect(t.startPairing([0, 1, 2, 3])).rejects.toThrow("not connected");
});

test("pairing walks each slot with a confirm phase then reports done", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.startPairing([0, 3, 5]); // three canonical spots
  await jest.runAllTimersAsync();

  // Two-tap semantics (lib/pairing): prompt, then awaiting-confirm, per slot.
  const prompts = events
    .filter((e) => e.kind === "pairing")
    .map((e) => {
      const pr = (e as Extract<StatusEvent, { kind: "pairing" }>).progress;
      return `${pr.currentPrompt}${pr.awaitingConfirm ? "+" : ""}`;
    });
  expect(prompts).toEqual(["0", "0+", "1", "1+", "2", "2+", "-1"]);

  // After the round the session returns to idle with all targets online.
  const last = events.filter((e) => e.kind === "session").pop();
  expect(last).toMatchObject({ state: "idle", targetsOnline: 3 });
});

test("pairing sanitizes the spot set like the firmware clamp", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  // Duplicates and out-of-range spots are dropped; 2 valid spots remain.
  await t.startPairing([3, 3, 9, -1, 5]);
  await jest.runAllTimersAsync();

  const last = events.filter((e) => e.kind === "pairing").pop() as Extract<
    StatusEvent,
    { kind: "pairing" }
  >;
  expect(last.progress).toMatchObject({ currentPrompt: -1, total: 2 });
});

test("cancelling a pairing round returns to idle without a done event", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.startPairing([0, 2, 4, 6]);
  await jest.advanceTimersByTimeAsync(120); // partway through the round

  await t.stopSession();
  await jest.runAllTimersAsync(); // no further pairing events may fire

  const doneEvents = events.filter(
    (e) => e.kind === "pairing" && e.progress.currentPrompt === -1,
  );
  expect(doneEvents).toHaveLength(0);
  const last = events.filter((e) => e.kind === "session").pop();
  expect(last).toMatchObject({ state: "idle" });
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

test("each step emits a resolved event carrying hit/miss for the live screen", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.loadDrill({ mode: "random", numPositions: 4, count: 3, timeoutMs: 800 });
  await t.startSession();
  await jest.runAllTimersAsync();

  const resolved = events.filter((e) => e.kind === "resolved") as Extract<
    StatusEvent,
    { kind: "resolved" }
  >[];
  expect(resolved.map((e) => e.seq)).toEqual([0, 1, 2]);
  // missEvery=3 → seq 2 is the miss; it carries the timeout as reactionMs.
  expect(resolved.map((e) => e.miss)).toEqual([false, false, true]);
  expect(resolved[2].reactionMs).toBe(800);
  expect(resolved[0].reactionMs).toBeGreaterThan(0);

  // Ordering contract: a step resolves before the next target is armed.
  const timeline = events
    .filter((e) => e.kind === "progress" || e.kind === "resolved")
    .map((e) => `${e.kind}:${(e as { seq: number }).seq}`);
  expect(timeline).toEqual([
    "progress:0",
    "resolved:0",
    "progress:1",
    "resolved:1",
    "progress:2",
    "resolved:2",
  ]);
});

test("a drill without a timeout never misses (engine semantics)", async () => {
  const t = make(); // missEvery=3, but no timeoutMs on the drill
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.loadDrill({ mode: "random", numPositions: 4, count: 6 });
  await t.startSession();
  await jest.runAllTimersAsync();

  const dump = t.dumpResults();
  await jest.runAllTimersAsync();
  const hits = await dump;
  expect(hits).toHaveLength(6);
  expect(hits.every((h) => !h.miss)).toBe(true);
});

test("invalid numPositions is clamped — no NaN positions", async () => {
  const t = make();
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.loadDrill({ mode: "random", numPositions: 0, count: 4 });
  await t.startSession();
  await jest.runAllTimersAsync();

  const dump = t.dumpResults();
  await jest.runAllTimersAsync();
  const hits = await dump;
  expect(hits).toHaveLength(4);
  for (const h of hits) {
    expect(Number.isInteger(h.position)).toBe(true);
    expect(h.position).toBe(0); // clamped to a single-slot layout
  }
});

test("time mode fills the duration window instead of a rep count", async () => {
  const t = make(); // stepMs=100
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  // 1 s window at 100 ms per step → 10 steps, regardless of count.
  await t.loadDrill({ mode: "time", numPositions: 4, durationMs: 1000, count: 3 });
  await t.startSession();
  await jest.runAllTimersAsync();

  const dump = t.dumpResults();
  await jest.runAllTimersAsync();
  const hits = await dump;
  expect(hits).toHaveLength(10);
});

test("failed connect rejects and lands in the error state with a reason", async () => {
  const t = new MockCentralTransport({ latencyMs: 0, failConnect: true });
  const events = record(t);

  const p = t.connect();
  p.catch(() => {}); // attach early so the rejection is never unhandled
  await jest.runAllTimersAsync();
  await expect(p).rejects.toThrow("connect failed");

  expect(t.connectionState).toBe("error");
  const last = events.filter((e) => e.kind === "connection").pop() as Extract<
    StatusEvent,
    { kind: "connection" }
  >;
  expect(last).toMatchObject({ state: "error", reason: "mock: connect failed" });
});

test("connect during connecting joins the in-flight attempt", async () => {
  const t = make();
  const first = t.connect();
  const second = t.connect(); // must not resolve before the link is up
  let secondDone = false;
  second.then(() => {
    secondDone = true;
  });
  expect(secondDone).toBe(false);
  await jest.runAllTimersAsync();
  await Promise.all([first, second]);
  expect(t.connectionState).toBe("connected");
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
