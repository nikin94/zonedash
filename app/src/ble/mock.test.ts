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

test("interactive pairing: each bind is prompted at the operator-picked spot", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.startPairing(2);
  await jest.runAllTimersAsync(); // round opens, waiting for the first pick

  // Free-form placement: both targets on the left side of the court.
  await t.selectPairingSpot(7); // mid left
  await jest.runAllTimersAsync();
  await t.selectPairingSpot(6); // back left
  await jest.runAllTimersAsync();

  // Per pick: prompt ("press here") → confirm ("again?") → bound snapshot.
  const trace = events
    .filter((e) => e.kind === "pairing")
    .map((e) => {
      const pr = (e as Extract<StatusEvent, { kind: "pairing" }>).progress;
      return `${pr.currentSpot ?? "-"}${pr.awaitingConfirm ? "+" : ""}b${pr.boundSpots.length}${pr.done ? "!" : ""}`;
    });
  expect(trace).toEqual(["-b0", "7b0", "7+b0", "-b1", "6b1", "6+b1", "-b2!"]);

  const last = events.filter((e) => e.kind === "pairing").pop() as Extract<
    StatusEvent,
    { kind: "pairing" }
  >;
  expect(last.progress.boundSpots).toEqual([7, 6]); // bind order preserved

  // After the round the session returns to idle with all targets online.
  const lastSession = events.filter((e) => e.kind === "session").pop();
  expect(lastSession).toMatchObject({ state: "idle", targetsOnline: 2 });
});

test("extendPairing grows a completed round keeping the bound spots", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.startPairing(2);
  await jest.runAllTimersAsync();
  await t.selectPairingSpot(0);
  await jest.runAllTimersAsync();
  await t.selectPairingSpot(2);
  await jest.runAllTimersAsync(); // round done, session idle

  await t.extendPairing(3); // one more target, binds kept
  await jest.runAllTimersAsync();

  // The round resumed: not done, waiting for a pick, old binds intact.
  let last = events.filter((e) => e.kind === "pairing").pop() as Extract<
    StatusEvent,
    { kind: "pairing" }
  >;
  expect(last.progress).toMatchObject({
    total: 3,
    boundSpots: [0, 2],
    currentSpot: null,
    done: false,
  });

  await t.selectPairingSpot(6);
  await jest.runAllTimersAsync();
  last = events.filter((e) => e.kind === "pairing").pop() as Extract<
    StatusEvent,
    { kind: "pairing" }
  >;
  expect(last.progress).toMatchObject({ boundSpots: [0, 2, 6], done: true });
  const lastSession = events.filter((e) => e.kind === "session").pop();
  expect(lastSession).toMatchObject({ state: "idle", targetsOnline: 3 });
});

test("extendPairing refuses shrink/no-op and a never-paired state", async () => {
  const t = make();
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await expect(t.extendPairing(4)).rejects.toThrow("no pairing round");

  await t.startPairing(3);
  await jest.runAllTimersAsync();
  await expect(t.extendPairing(3)).rejects.toThrow("grow");
  await expect(t.extendPairing(2)).rejects.toThrow("grow");
});

test("selectPairingSpot rejects/ignores invalid picks like the central would", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  // No round open yet.
  await expect(t.selectPairingSpot(0)).rejects.toThrow("no pairing round");

  await t.startPairing(2);
  await jest.runAllTimersAsync();
  await expect(t.selectPairingSpot(9)).rejects.toThrow("bad spot");

  await t.selectPairingSpot(3);
  await jest.runAllTimersAsync(); // spot 3 bound
  const before = events.filter((e) => e.kind === "pairing").length;
  await t.selectPairingSpot(3); // already bound — silently ignored
  await jest.runAllTimersAsync();
  expect(events.filter((e) => e.kind === "pairing").length).toBe(before);
});

test("cancelling a pairing round returns to idle without a done event", async () => {
  const t = make();
  const events = record(t);
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;

  await t.startPairing(4);
  await jest.runAllTimersAsync();
  await t.selectPairingSpot(0);
  await jest.advanceTimersByTimeAsync(20); // mid-prompt, not yet bound

  await t.stopSession();
  await jest.runAllTimersAsync(); // no further pairing events may fire

  const doneEvents = events.filter(
    (e) => e.kind === "pairing" && e.progress.done,
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
