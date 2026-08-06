import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

import { MockCentralTransport } from "../../ble/mock";
import type { DrillConfig } from "../../ble/transport";
import { DEFAULT_SETTINGS, type DrillSettings } from "../../state/AppState";
import { DrillPanel } from "./DrillPanel";

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
  expect(screen.getByTestId("path-sequence")).toHaveTextContent(
    "back left → net left → back left",
  );

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

test("path Undo drops the last step; Clear empties the sequence", async () => {
  const t = await connectedTransport();
  panel(t);

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-7-available"));
  expect(screen.getByTestId("path-sequence")).toHaveTextContent(
    "net left → mid left",
  );

  fireEvent.press(screen.getByText("Undo"));
  expect(screen.getByTestId("path-sequence")).toHaveTextContent(/^net left$/);

  fireEvent.press(screen.getByText("Clear"));
  expect(screen.queryByTestId("path-sequence")).toBeNull();
  expect(screen.getByText(/Tap paired spots on the map/)).toBeTruthy();
});

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
  expect(screen.getByTestId("path-sequence")).toHaveTextContent(/^net left$/);

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
  // canonical 6 (back left, BL) then 0 (net left, FL).
  expect(screen.getByText("BL")).toBeTruthy();
  expect(screen.getByText("FL")).toBeTruthy();
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
