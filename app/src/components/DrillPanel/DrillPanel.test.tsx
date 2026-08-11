import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

import { StyleSheet } from "react-native";

import { MAX_DRILL_PATH } from "../../ble/codec";
import { SURFACE_MARGIN_TOP } from "../../helpers/court";
import { MockCentralTransport } from "../../ble/mock";
import type { DrillConfig } from "../../ble/transport";
import { DEFAULT_SETTINGS, type DrillSettings } from "../../state/AppState";
import { DrillPanel } from "./DrillPanel";

// The Path step chips, read back as their two-letter spot codes in step order —
// so a test can assert the authored sequence (and repeats) directly.
const pathCodes = () =>
  screen
    .queryAllByTestId(/^path-chip-code-\d+$/)
    .map((n) => n.props.children as string);

// Left-side layout from a pairing round: slot 0 = net left (0),
// slot 1 = mid left (7), slot 2 = back left (6).
const PAIRED = [0, 7, 6];

// Settings arrive from the Settings screen. No timeout exists in the app.
const SETTINGS: DrillSettings = {
  delayMs: 500,
  allowImmediateRepeat: true,
};

// Zero latency + a short step so fake timers drive the whole run explicitly.
// A fixed tap delay makes reaction times deterministic (the app leaves it
// random in the 750–1000 ms human-paced frame).
const connectedTransport = async () => {
  const t = new MockCentralTransport({ latencyMs: 0, stepMs: 100, tapDelayMs: 20 });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  return t;
};

const panel = (t: MockCentralTransport, paired = PAIRED, settings = SETTINGS) =>
  render(<DrillPanel transport={t} pairedSpots={paired} settings={settings} />);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("Start composes random config from the screen + settings — no timeout on the wire", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  panel(t);

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));

  expect(load).toHaveBeenCalledWith({
    mode: "random",
    numPositions: 3,
    count: 10,
    delayMs: 500,
    allowImmediateRepeat: true,
  } satisfies DrillConfig);
  expect(load).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ timeoutMs: expect.anything() }),
  );
  expect(screen.getByText("Stop")).toBeTruthy(); // the run started right away
});

test("stop-by-time resolves to the engine's time mode with a duration", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  panel(t);

  fireEvent.press(screen.getByText("Time"));
  expect(screen.queryByText("Targets to hit")).toBeNull();
  expect(screen.getByText("Duration")).toBeTruthy();

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "time", durationMs: 30000 }), // default window
  );
  expect(load).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ count: expect.anything() }),
  );
});

test("live mode sends exactly mode and positions — no delay or repeat leak", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  panel(t);

  fireEvent.press(screen.getByText("Live"));
  expect(screen.queryByText("Session length")).toBeNull();
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));

  expect(load).toHaveBeenLastCalledWith({
    mode: "live",
    numPositions: 3,
  } satisfies DrillConfig);
});

test("live mode is operator-driven — a court tap lights a target at once, then it resolves", async () => {
  // A small fixed tap delay makes the hit beat deterministic (the app leaves
  // it random, 750–1000 ms).
  const t = new MockCentralTransport({ latencyMs: 0, stepMs: 100, tapDelayMs: 20 });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  const arm = jest.spyOn(t, "armLiveTarget");
  panel(t, PAIRED, DEFAULT_SETTINGS);

  fireEvent.press(screen.getByText("Live"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));

  // Nothing arms on its own — the mock schedules no steps for live; the
  // operator drives it, and the map invites the first tap. No spinner here —
  // the lit target uses the radar ping, so no dot shows the pairing spinner.
  expect(screen.getByText("Tap a target to arm it")).toBeTruthy();
  expect(screen.queryAllByTestId("dot-spinner")).toHaveLength(0);

  // Tap net left (canonical 0 → slot 0): it lights up immediately (armed), no
  // arm delay.
  await act(async () => {
    fireEvent.press(screen.getByTestId("spot-0-available"));
  });
  expect(arm).toHaveBeenCalledWith(0);
  expect(screen.getByTestId("spot-0-armed")).toBeTruthy();

  // The athlete's hit resolves it → green flash + reaction time; the map is
  // ready for the next pick (liveBusy cleared).
  await act(() => jest.advanceTimersByTimeAsync(20));
  expect(screen.getByTestId("spot-0-hit")).toBeTruthy();
  expect(screen.getByText("0.02 s")).toBeTruthy(); // reaction, shown in seconds
});

test("path is authored on the same court map — slot-index wire format", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  panel(t);

  fireEvent.press(screen.getByText("Path"));
  // Only paired spots are offered; unpaired stay off. Empty path can't start.
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(3);
  expect(screen.getByTestId("spot-2-off")).toBeTruthy();
  fireEvent.press(screen.getByText("Start"));
  expect(load).not.toHaveBeenCalled();

  // Author: back left (6) → net left (0) → back left again (repeats allowed).
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-6-selected")); // already in path → selected
  expect(pathCodes()).toEqual(["BL", "FL", "BL"]);
  // The reused spot 6 carries both its step ordinals as one map badge ("1·3").
  expect(screen.getByTestId("spot-badge-6")).toHaveTextContent("1·3");
  expect(screen.getByTestId("spot-badge-0")).toHaveTextContent("2");

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  // Canonical spots 6/0/6 are slots 2/0/2 in the paired order; path uses the
  // screen delay but no repeat (repeat only shapes the random pickers).
  expect(load).toHaveBeenCalledWith({
    mode: "path",
    numPositions: 3,
    delayMs: 500,
    path: [2, 0, 2],
  } satisfies DrillConfig);
});

// A spot reused many times would grow a map badge that overflows the dot and
// clips its LATEST steps off; past the cap the oldest elide to "…" so the newest
// stay visible (see formatStepBadge).
test("a heavily reused spot's badge elides its oldest steps, keeping the newest", async () => {
  const t = await connectedTransport();
  panel(t);

  fireEvent.press(screen.getByText("Path"));
  // BL at steps 1, 3, 5, 7 (FL fills the even steps between).
  for (let i = 0; i < 4; i++) {
    fireEvent.press(screen.getByTestId(/spot-6-(available|selected)/));
    fireEvent.press(screen.getByTestId(/spot-0-(available|selected)/));
  }
  expect(pathCodes()).toEqual(["BL", "FL", "BL", "FL", "BL", "FL", "BL", "FL"]);
  // BL's four ordinals (1·3·5·7) elide to the last two behind a leading ellipsis.
  expect(screen.getByTestId("spot-badge-6")).toHaveTextContent("…5·7");
});

test("path Undo drops the last step; Clear empties the sequence", async () => {
  const t = await connectedTransport();
  panel(t);

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-7-available"));
  expect(pathCodes()).toEqual(["FL", "ML"]);

  fireEvent.press(screen.getByText("Undo"));
  expect(pathCodes()).toEqual(["FL"]);

  fireEvent.press(screen.getByText("Clear"));
  expect(screen.queryByTestId("path-sequence")).toBeNull();
  expect(screen.getByText(/Tap paired spots on the map/)).toBeTruthy();
});

test("tapping a step chip removes THAT step, and the badges renumber", async () => {
  const t = await connectedTransport();
  panel(t);

  fireEvent.press(screen.getByText("Path"));
  // Author FL(0) → ML(7) → BL(6).
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-7-available"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  expect(pathCodes()).toEqual(["FL", "ML", "BL"]);
  expect(screen.getByTestId("spot-badge-7")).toHaveTextContent("2");

  // Tap the MIDDLE chip (step 2, ML): it collapses (a ~180 ms width animation),
  // THEN drops — so it's still present until the animation runs out.
  fireEvent.press(screen.getByTestId("path-chip-1"));
  expect(pathCodes()).toEqual(["FL", "ML", "BL"]); // still there mid-collapse
  await act(() => jest.advanceTimersByTimeAsync(200)); // collapse completes → removed

  // Only it drops, and the trailing step renumbers from 3 to 2 (its badge follows).
  expect(pathCodes()).toEqual(["FL", "BL"]);
  expect(screen.queryByTestId("spot-badge-7")).toBeNull(); // ML no longer in the path
  expect(screen.getByTestId("spot-badge-6")).toHaveTextContent("2"); // BL is now step 2
});

// The authored path is bounded so a LoadDrill write always fits one ATT MTU (no
// write-long) — see codec MAX_DRILL_PATH. Past the cap a tap is a no-op and the
// "full" hint appears; the sent config carries exactly the cap, not more.
//
// Deliberately heavy: it authors MAX_DRILL_PATH (162) steps through the UI, one
// synchronous tap each, and every tap re-renders the whole step-chip strip — so
// the cost is O(n^2) in the cap. That is far past any real hand-authored path,
// but the boundary is exactly what this test guards, so it can't tap fewer. A
// generous timeout keeps it green on a slow CI runner (it ran ~2 s locally but
// tripped the default 5 s cap on CI); real usage never approaches this size.
test(
  "authoring past the cap no-ops — the wire path never exceeds MAX_DRILL_PATH",
  async () => {
    const t = await connectedTransport();
    const load = jest.spyOn(t, "loadDrill");
    panel(t);

    fireEvent.press(screen.getByText("Path"));
    fireEvent.press(screen.getByTestId("spot-0-available")); // first step (repeats ok)
    // Tap well past the cap; every append beyond MAX_DRILL_PATH is dropped.
    for (let i = 1; i < MAX_DRILL_PATH + 10; i++) {
      fireEvent.press(screen.getByTestId("spot-0-selected"));
    }
    expect(screen.getByTestId("path-full")).toBeTruthy();

    fireEvent.press(screen.getByText("Start"));
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(load.mock.calls[0][0].path).toHaveLength(MAX_DRILL_PATH);
  },
  20000,
);

test("a re-pair filters the authored path — nothing translates to -1", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  const { rerender } = render(
    <DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />,
  );

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));

  // Re-pair drops spot 6 (kept 0 and 7) — the stale step must vanish.
  rerender(<DrillPanel transport={t} pairedSpots={[0, 7]} settings={SETTINGS} />);
  expect(pathCodes()).toEqual(["FL"]);

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "path", numPositions: 2, path: [0] }),
  );
});

test("a run arms spots, flashes hits, and ends in a hits-only summary", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS); // no delay — deterministic step cadence

  // Author a deterministic path drill: slots 2, 0 → canonical spots 6, 0.
  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // seq 0 armed

  // Step 1: slot 2 → back left (6) lights up (radar ping, not a spinner).
  expect(screen.getByText("Step 1")).toBeTruthy();
  expect(screen.getByTestId("spot-6-armed")).toBeTruthy();
  expect(screen.queryAllByTestId("dot-spinner")).toHaveLength(0);
  expect(screen.getByText("React when a target lights up")).toBeTruthy();

  // The step resolves as a hit → green flash + the reaction time (seconds).
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByTestId("spot-6-hit")).toBeTruthy();
  expect(screen.getByText("0.02 s")).toBeTruthy();
  expect(screen.getByText("Step 2")).toBeTruthy();

  // Run out: second step resolves, session flips done, results panel fetched —
  // the numbers live below the court, not on it.
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Run again")).toBeTruthy();
  expect(screen.getByText("Session complete")).toBeTruthy();
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(screen.getAllByText("0.02 s")).toHaveLength(3); // 2 attempts + average
  expect(screen.getByText("0.04 s")).toBeTruthy(); // total time
  expect(screen.getByText("Average")).toBeTruthy();
  // Each attempt is tagged with its two-letter spot code: slots 2,0 →
  // canonical 6 (back left, BL) then 0 (net left, FL). Scoped to the results
  // list — the authored path's step chips carry the same codes on the surface
  // above, so an unscoped query is ambiguous.
  const attempts = screen.getByTestId("attempt-list");
  expect(within(attempts).getByText("BL")).toBeTruthy();
  expect(within(attempts).getByText("FL")).toBeTruthy();
});

test("a finished run's results are tied to its mode — hidden on another mode", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS);

  // Run a path drill to completion.
  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(screen.getByText("Run again")).toBeTruthy();

  // Switch to another mode: the path run's stats belong to Path, so they go
  // away and the screen reads fresh (Start, no "Session complete").
  fireEvent.press(screen.getByText("Live"));
  expect(screen.queryByTestId("stats-panel")).toBeNull();
  expect(screen.queryByText("Session complete")).toBeNull();
  expect(screen.getByText("Start")).toBeTruthy();

  // Back on Path, the same run's results return.
  fireEvent.press(screen.getByText("Path"));
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(screen.getByText("Run again")).toBeTruthy();
});

test("the hit flash clears back to available after its window", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS);

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(50)); // seq 0 resolved
  expect(screen.getByTestId("spot-6-hit")).toBeTruthy();

  await act(() => jest.advanceTimersByTimeAsync(500)); // flash window passed
  expect(screen.queryByTestId("spot-6-hit")).toBeNull();
});

test("Stop aborts the run and still summarizes the partial records", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS);

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-7-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(60)); // one step resolved

  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync()); // no further steps may land

  // The partial run still summarizes: one attempt in the results panel, keyed
  // by a plain number (no "Attempt" prefix) and a court-position icon.
  expect(screen.getByText("Run again")).toBeTruthy();
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  const rows = screen.getByTestId("attempt-list");
  expect(within(rows).getByText("1")).toBeTruthy();
  expect(within(rows).queryByText("2")).toBeNull();
  expect(screen.queryByText(/Attempt/)).toBeNull();
  expect(screen.queryAllByTestId(/spot-icon-\d/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Step \d/)).toBeNull();
});

// A finished run's results describe the path + layout it ran over. The court
// stays tappable after "Session complete", so authoring the NEXT path must not
// leave the previous run's summary on screen next to a path it no longer
// matches (the reported bug: authored path ≠ the results shown).
test("authoring a new path after a run clears the stale results summary", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS);

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("stats-panel")).toBeTruthy(); // the run's summary

  // Tap the court again — the operator is authoring the next run.
  fireEvent.press(screen.getByTestId("spot-7-available"));
  expect(pathCodes()).toEqual(["BL", "FL", "ML"]);
  // The old summary must be gone — it belonged to the two-spot run, not this one.
  expect(screen.queryByTestId("stats-panel")).toBeNull();
});

// HitRecord.position is a slot index into the session's pairing map; a re-pair
// swaps that map, so a prior run's records would render against the wrong spots
// (even ones no longer paired). A layout change must drop the stale summary.
test("a layout change after a run clears the stale results summary", async () => {
  const t = await connectedTransport();
  const { rerender } = render(
    <DrillPanel transport={t} pairedSpots={PAIRED} settings={DEFAULT_SETTINGS} />,
  );

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("stats-panel")).toBeTruthy();

  // Re-pair to a different layout — the old slot-indexed records no longer map.
  rerender(<DrillPanel transport={t} pairedSpots={[1, 2, 3]} settings={DEFAULT_SETTINGS} />);
  expect(screen.queryByTestId("stats-panel")).toBeNull();
});

test("a finished run reports a summary to onSessionComplete exactly once", async () => {
  const t = await connectedTransport();
  const onSessionComplete = jest.fn();
  render(
    <DrillPanel
      transport={t}
      pairedSpots={PAIRED}
      settings={SETTINGS}
      onSessionComplete={onSessionComplete}
    />,
  );

  // A two-step path run (slots 2, 0), each resolving at the fixed 20 ms tap.
  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("Session complete")).toBeTruthy();
  expect(onSessionComplete).toHaveBeenCalledTimes(1);
  expect(onSessionComplete.mock.calls[0][0]).toMatchObject({
    mode: "path",
    numPositions: 3,
    attempts: 2,
    avgMs: 20, // both hits at the 20 ms tap delay
    bestMs: 20,
  });
});

test("an aborted run with no attempts is not logged", async () => {
  const t = await connectedTransport();
  const onSessionComplete = jest.fn();
  render(
    <DrillPanel
      transport={t}
      pairedSpots={PAIRED}
      settings={SETTINGS}
      onSessionComplete={onSessionComplete}
    />,
  );

  fireEvent.press(screen.getByText("Start")); // random run
  await act(() => jest.advanceTimersByTimeAsync(0)); // first target armed, none resolved
  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync());

  // A 0-attempt session still summarizes on screen but is not worth a history row.
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(onSessionComplete).not.toHaveBeenCalled();
});

test("a failed start surfaces as an inline error, not a crash", async () => {
  const t = await connectedTransport();
  jest.spyOn(t, "startSession").mockRejectedValueOnce(new Error("write failed"));
  panel(t);

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("write failed")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy(); // still retryable
});

// Rehydration: a fresh DrillPanel mount must reflect the central's current
// session (snapshot on the seam), not start blank over a run already going —
// otherwise a remount shows idle "Start" over a live run with no way to stop.
test("a remount over a running session rehydrates it — Stop and the armed target", async () => {
  const t = await connectedTransport();
  await t.loadDrill({ mode: "path", numPositions: 3, path: [2, 0], delayMs: 0 });
  await t.startSession();
  await act(() => jest.advanceTimersByTimeAsync(10)); // seq 0 armed, not resolved
  expect(t.sessionSnapshot.state).toBe("running");
  expect(t.sessionSnapshot.armedPosition).toBe(2);

  // A brand-new panel mounts onto that run.
  panel(t, PAIRED, DEFAULT_SETTINGS);
  expect(screen.getByText("Stop")).toBeTruthy();
  expect(screen.queryByText("Start")).toBeNull();
  expect(screen.getByTestId("spot-6-armed")).toBeTruthy(); // slot 2 → canonical 6
  expect(screen.getByText("Step 1")).toBeTruthy();

  // Stop drives the rehydrated panel through to a summary.
  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Run again")).toBeTruthy();
});

// Rehydration is scoped to a RUNNING session on purpose: a mount over a
// finished one lands on a fresh idle Start (not trapped on "Fetching…", not a
// disabled Run again over a path it no longer holds) — the operator left, and
// re-authoring is the likely next step.
test("a remount over a finished session lands on a fresh idle Start", async () => {
  const t = await connectedTransport();
  await t.loadDrill({ mode: "path", numPositions: 3, path: [2, 0], delayMs: 0 });
  await t.startSession();
  await act(() => jest.runAllTimersAsync()); // whole run resolves → done
  expect(t.sessionSnapshot.state).toBe("done");

  panel(t, PAIRED, DEFAULT_SETTINGS);
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Start")).toBeTruthy();
  expect(screen.queryByText("Stop")).toBeNull();
  expect(screen.queryByText("Run again")).toBeNull();
});

// The snapshot carries the loaded config, not just the run's progress: a
// rehydrated path run keeps its sequence, so `Run again` stays enabled and
// re-runs the same drill instead of dead-ending on an empty (disabled) path.
test("a rehydrated run restores the config — path Run again works", async () => {
  const t = await connectedTransport();
  await t.loadDrill({ mode: "path", numPositions: 3, path: [2, 0], delayMs: 0 });
  await t.startSession();
  await act(() => jest.advanceTimersByTimeAsync(10)); // running, seq 0 armed

  // A brand-new panel mounts onto the run and inherits its authored path.
  panel(t, PAIRED, DEFAULT_SETTINGS);
  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync()); // → done

  // Slots 2, 0 → canonical spots 6, 0 (back left → net left) — restored, not lost.
  expect(pathCodes()).toEqual(["BL", "FL"]);

  // Run again re-runs the SAME path — not a dead disabled button over an empty one.
  const load = jest.spyOn(t, "loadDrill");
  fireEvent.press(screen.getByText("Run again"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "path", path: [2, 0] }),
  );
  expect(screen.getByText("Stop")).toBeTruthy(); // the re-run started
});

// Random/time params rehydrate too — a remounted count run reads its real
// count off the snapshot, not the default.
test("a rehydrated random run shows its real count, not the default", async () => {
  const t = await connectedTransport();
  await t.loadDrill({ mode: "random", numPositions: 3, count: 20 });
  await t.startSession();
  await act(() => jest.advanceTimersByTimeAsync(10)); // running

  panel(t, PAIRED, DEFAULT_SETTINGS);
  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync()); // → done, config visible again

  // Re-running must send count=20 (the drill that actually ran), not the 10 default.
  const load = jest.spyOn(t, "loadDrill");
  fireEvent.press(screen.getByText("Run again"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "random", count: 20 }),
  );
});

// The drill surface must start at the SAME shared top offset as the idle and
// pairing surfaces (court.ts) — otherwise the court jumps when the pairing
// handoff swaps this panel in. The offset rides the ScrollView's content
// container. Regression: this surface was at 16 while the others were at 32.
test("the drill surface sits at the shared surface top offset", async () => {
  const t = await connectedTransport();
  panel(t);
  const cc = StyleSheet.flatten(
    screen.getByTestId("drill-surface").props.contentContainerStyle,
  );
  expect(cc.marginTop).toBe(SURFACE_MARGIN_TOP);
});
