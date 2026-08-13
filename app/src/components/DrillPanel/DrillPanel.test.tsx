import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import { StyleSheet } from "react-native";

import { NavigationContainer } from "@react-navigation/native";

import { MAX_DRILL_PATH } from "../../ble/codec";
import {
  TAB_BAR_DISC_RISE,
  TAB_BAR_ROW_H,
  tabBarClearance,
} from "../../navigation/GlassTabBar";
import { MockCentralTransport } from "../../ble/mock";
import type { DrillConfig } from "../../ble/transport";
import { DEFAULT_SETTINGS, type DrillSettings } from "../../state/AppState";
import { dismissToast } from "../../state/toast";
import { colors } from "../../theme";
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
  const t = new MockCentralTransport({
    latencyMs: 0,
    stepMs: 100,
    tapDelayMs: 20,
  });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  return t;
};

// Settings persistence is exercised on its own (DrillSetupPage); these render
// helpers just need a no-op so the required prop is satisfied.
const noop = () => {};

const panel = (t: MockCentralTransport, paired = PAIRED, settings = SETTINGS) =>
  render(
    <DrillPanel
      transport={t}
      pairedSpots={paired}
      settings={settings}
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
    />,
    // DrillPanel hosts a nested native-stack (the drill surface + the pushed
    // setup route), so it needs a NavigationContainer ancestor. The wrapper
    // applies to rerender() too.
    { wrapper: NavigationContainer },
  );

// Mode + the Random params moved to the drill-setup page (a route pushed from
// the gear beside Start). These open it, make the selection, and close — the way
// the operator now drives the config. Path authoring itself still happens on the
// court, so only the mode/param pick needs the page open.
// The gear PUSHES the setup route onto the drill's nested stack; Done pops it.
// The navigator drives the transition, so a press flushes the mount/unmount
// inside act — no hand-rolled animation timers to run out.
const openSetup = () =>
  act(() => {
    fireEvent.press(screen.getByTestId("drill-settings-button"));
  });
const closeSetup = () =>
  act(() => {
    fireEvent.press(screen.getByTestId("drill-settings-done"));
  });
const selectMode = (label: string) => {
  openSetup();
  fireEvent.press(screen.getByText(label));
  closeSetup();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  dismissToast(); // the toast store is a module singleton — clear between tests
});

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

  openSetup();
  fireEvent.press(screen.getByText("Seconds")); // the "Time" stop-by is labelled Seconds
  expect(screen.queryByText("Targets to hit")).toBeNull();
  expect(screen.getByText("Duration")).toBeTruthy();
  closeSetup();

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

  openSetup();
  fireEvent.press(screen.getByText("Live"));
  expect(screen.queryByText("Session length")).toBeNull();
  closeSetup();
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
  const t = new MockCentralTransport({
    latencyMs: 0,
    stepMs: 100,
    tapDelayMs: 20,
  });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  const arm = jest.spyOn(t, "armLiveTarget");
  panel(t, PAIRED, DEFAULT_SETTINGS);

  selectMode("Live");
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
  expect(screen.getByText("0.02s")).toBeTruthy(); // reaction, shown in seconds
});

test("path is authored on the same court map — slot-index wire format", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  panel(t);

  selectMode("Path");
  // Only paired spots are offered; unpaired ones aren't drawn at all (hideOff),
  // so the schematic shows just the 3 targets in play. Empty path can't start.
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(3);
  expect(screen.queryByTestId("spot-2-off")).toBeNull(); // unpaired → hidden
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

  selectMode("Path");
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

  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-7-available"));
  expect(pathCodes()).toEqual(["FL", "ML"]);

  // Undo collapses the last chip (same animation as a tap), so its drop lands
  // once the slide-out completes — run the timers out.
  fireEvent.press(screen.getByText("Undo"));
  act(() => jest.runAllTimers());
  expect(pathCodes()).toEqual(["FL"]);

  fireEvent.press(screen.getByText("Clear"));
  expect(screen.queryByTestId("path-sequence")).toBeNull();
  expect(screen.getByText(/Tap paired spots on the map/)).toBeTruthy();
});

test("tapping a step chip removes THAT step, and the badges renumber", async () => {
  const t = await connectedTransport();
  panel(t);

  selectMode("Path");
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
test("authoring past the cap no-ops — the wire path never exceeds MAX_DRILL_PATH", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  panel(t);

  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-0-available")); // first step (repeats ok)
  // Tap well past the cap; every append beyond MAX_DRILL_PATH is dropped.
  for (let i = 1; i < MAX_DRILL_PATH + 10; i++) {
    fireEvent.press(screen.getByTestId("spot-0-selected"));
  }
  expect(screen.getByTestId("path-full")).toBeTruthy();

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(load.mock.calls[0][0].path).toHaveLength(MAX_DRILL_PATH);
}, 20000);

test("a re-pair filters the authored path — nothing translates to -1", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  const { rerender } = render(
    <DrillPanel
      transport={t}
      pairedSpots={PAIRED}
      settings={SETTINGS}
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
    />,
    { wrapper: NavigationContainer },
  );

  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));

  // Re-pair drops spot 6 (kept 0 and 7) — the stale step must vanish.
  rerender(
    <DrillPanel
      transport={t}
      pairedSpots={[0, 7]}
      settings={SETTINGS}
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
    />,
  );
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
  selectMode("Path");
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
  expect(screen.getByText("0.02s")).toBeTruthy();
  expect(screen.getByText("Step 2")).toBeTruthy();

  // Run out: second step resolves, session flips done, results panel fetched —
  // the numbers live below the court, not on it.
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Start")).toBeTruthy(); // constant label, even when done
  // Completion is announced by the results popup now (not a toast): it carries
  // the headline numbers — hits, total, average. Dismiss it before reading the
  // panel below, so its copies of the numbers don't double the panel's counts.
  expect(screen.getByTestId("session-result")).toBeTruthy();
  expect(screen.getByTestId("result-hits")).toHaveTextContent("2");
  expect(screen.getByTestId("result-total")).toHaveTextContent("0.04s");
  expect(screen.getByTestId("result-average")).toHaveTextContent("0.02s");
  fireEvent.press(screen.getByTestId("session-result-done"));

  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(screen.getAllByText("0.02s")).toHaveLength(3); // 2 attempts + average
  expect(screen.getByText("0.04s")).toBeTruthy(); // total time
  expect(screen.getByText("Average")).toBeTruthy();

  // The results divider (the panel's top border) carries no top margin of its
  // own — the action block's balance lands it ACTION_GAP below Start, matching
  // the court→Start gap above (symmetric spacing).
  const statsStyle = StyleSheet.flatten(
    screen.getByTestId("stats-panel").props.style,
  );
  expect(statsStyle.marginTop).toBeUndefined();

  // Total time is the emphasised summary row — bold and a touch larger than the
  // per-attempt / Average rows (size 13).
  const totalLabel = StyleSheet.flatten(
    screen.getByText("Total time").props.style,
  );
  expect(totalLabel.fontWeight).toBe("700");
  expect(totalLabel.fontSize).toBe(15);
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
  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy(); // constant label

  // Switch to another mode: the path run's stats belong to Path, so they go
  // away and the screen reads fresh (Start).
  selectMode("Live");
  expect(screen.queryByTestId("stats-panel")).toBeNull();
  expect(screen.getByText("Start")).toBeTruthy();

  // Back on Path, the same run's results return.
  selectMode("Path");
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();
});

test("the hit flash clears back to available after its window", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS);

  selectMode("Path");
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

  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-7-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(60)); // one step resolved

  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync()); // no further steps may land

  // The partial run still summarizes: one attempt in the results panel, keyed
  // by a plain number (no "Attempt" prefix) and a court-position icon.
  expect(screen.getByText("Start")).toBeTruthy();
  expect(screen.getByTestId("stats-panel")).toBeTruthy();
  const rows = screen.getByTestId("attempt-list");
  expect(within(rows).getByText("1")).toBeTruthy();
  expect(within(rows).queryByText("2")).toBeNull();
  expect(screen.queryByText(/Attempt/)).toBeNull();
  expect(screen.queryAllByTestId(/spot-icon-\d/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Step \d/)).toBeNull();
});

// A finished run's results describe the path + layout it ran over. The court
// stays tappable after a run finishes, so authoring the NEXT path must not
// leave the previous run's summary on screen next to a path it no longer
// matches (the reported bug: authored path ≠ the results shown).
test("authoring a new path after a run clears the stale results summary", async () => {
  const t = await connectedTransport();
  panel(t, PAIRED, DEFAULT_SETTINGS);

  selectMode("Path");
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
    <DrillPanel
      transport={t}
      pairedSpots={PAIRED}
      settings={DEFAULT_SETTINGS}
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
    />,
    { wrapper: NavigationContainer },
  );

  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("stats-panel")).toBeTruthy();

  // Re-pair to a different layout — the old slot-indexed records no longer map.
  rerender(
    <DrillPanel
      transport={t}
      pairedSpots={[1, 2, 3]}
      settings={DEFAULT_SETTINGS}
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
    />,
  );
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
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
      onSessionComplete={onSessionComplete}
    />,
    { wrapper: NavigationContainer },
  );

  // A two-step path run (slots 2, 0), each resolving at the fixed 20 ms tap.
  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByTestId("session-result")).toBeTruthy(); // completion → popup
  expect(onSessionComplete).toHaveBeenCalledTimes(1);
  expect(onSessionComplete.mock.calls[0][0]).toMatchObject({
    mode: "path",
    numPositions: 3,
    attempts: 2,
    avgMs: 20, // both hits at the 20 ms tap delay
    bestMs: 20,
  });
});

// A set player name headlines the completion popup AND rides the logged summary,
// so a finished run is attributed to the runner both on screen and in history.
test("a set player name headlines the popup and tags the session summary", async () => {
  const t = await connectedTransport();
  const onSessionComplete = jest.fn();
  render(
    <DrillPanel
      transport={t}
      pairedSpots={PAIRED}
      settings={SETTINGS}
      onSettingsChange={noop}
      playerName="Alice"
      onPlayerNameChange={noop}
      onSessionComplete={onSessionComplete}
    />,
    { wrapper: NavigationContainer },
  );

  selectMode("Path");
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());

  // The popup headlines the runner's name.
  expect(screen.getByTestId("session-result-player")).toHaveTextContent(
    "Alice",
  );
  // …and the logged summary carries it for the history row.
  expect(onSessionComplete.mock.calls[0][0]).toMatchObject({
    playerName: "Alice",
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
      onSettingsChange={noop}
      playerName=""
      onPlayerNameChange={noop}
      onSessionComplete={onSessionComplete}
    />,
    { wrapper: NavigationContainer },
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
  jest
    .spyOn(t, "startSession")
    .mockRejectedValueOnce(new Error("write failed"));
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
  await t.loadDrill({
    mode: "path",
    numPositions: 3,
    path: [2, 0],
    delayMs: 0,
  });
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

  // Regression: the action block stretches while running too, so Stop fills the
  // row instead of collapsing to a sliver next to the gear.
  const runningBlock = StyleSheet.flatten(
    screen.getByTestId("action-block").props.style,
  );
  expect(runningBlock.alignSelf).toBe("stretch");

  // Stop drives the rehydrated panel through to a summary.
  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Start")).toBeTruthy(); // constant label after done
});

// Rehydration is scoped to a RUNNING session on purpose: a mount over a
// finished one lands on a fresh idle Start (not trapped over a path it no
// longer holds) — the operator left, and re-authoring is the likely next step.
test("a remount over a finished session lands on a fresh idle Start", async () => {
  const t = await connectedTransport();
  await t.loadDrill({
    mode: "path",
    numPositions: 3,
    path: [2, 0],
    delayMs: 0,
  });
  await t.startSession();
  await act(() => jest.runAllTimersAsync()); // whole run resolves → done
  expect(t.sessionSnapshot.state).toBe("done");

  panel(t, PAIRED, DEFAULT_SETTINGS);
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Start")).toBeTruthy();
  expect(screen.queryByText("Stop")).toBeNull();
});

// The snapshot carries the loaded config, not just the run's progress: a
// rehydrated path run keeps its sequence, so Start stays enabled and re-runs
// the same drill instead of dead-ending on an empty (disabled) path.
test("a rehydrated run restores the config — Start re-runs the same path", async () => {
  const t = await connectedTransport();
  await t.loadDrill({
    mode: "path",
    numPositions: 3,
    path: [2, 0],
    delayMs: 0,
  });
  await t.startSession();
  await act(() => jest.advanceTimersByTimeAsync(10)); // running, seq 0 armed

  // A brand-new panel mounts onto the run and inherits its authored path.
  panel(t, PAIRED, DEFAULT_SETTINGS);
  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync()); // → done

  // Slots 2, 0 → canonical spots 6, 0 (back left → net left) — restored, not lost.
  expect(pathCodes()).toEqual(["BL", "FL"]);

  // Start re-runs the SAME path — not a dead disabled button over an empty one.
  const load = jest.spyOn(t, "loadDrill");
  fireEvent.press(screen.getByText("Start"));
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
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "random", count: 20 }),
  );
});

// The drill surface must start at the SAME shared top offset as the idle and
// pairing surfaces (court.ts) — otherwise the court jumps when the pairing
// handoff swaps this panel in. The shared top offset now lives on ScreenWrapper
// (one uniform value across the three surfaces), so this surface must carry NO
// top margin of its own — otherwise it could drift back out of sync and jump
// the court. Regression: this surface was once at 16 while the others were 32.
test("the drill surface carries no top margin — the offset is on ScreenWrapper", async () => {
  const t = await connectedTransport();
  panel(t);
  const cc = StyleSheet.flatten(
    screen.getByTestId("drill-surface").props.contentContainerStyle,
  );
  expect(cc.marginTop).toBeUndefined();
});

// Layout (option A): the court is clean — the config and the primary action all
// live OUTSIDE the court, in the scrolling column below it. Under the court sits
// the [gear][Start] row (the gear opens the drill-setup page); the Mode selector
// is no longer inline, it lives behind the gear. Idle shows NO status line
// ("Pick a drill" is gone) and NO inline mode selector.
test("idle: the gear + Start row sits right under the court — no inline mode selector or status filler", async () => {
  const t = await connectedTransport();
  panel(t);

  const surface = screen.getByTestId("drill-surface");
  expect(within(surface).getByText("Start")).toBeTruthy();
  // The idle status filler is gone, and Mode moved behind the gear (no inline
  // selector / info affordance until the setup page is opened).
  expect(screen.queryByTestId("status-slot")).toBeNull();
  expect(screen.queryByTestId("mode-info-button")).toBeNull();
  expect(screen.queryByText("Pick a drill below to run")).toBeNull();
  // In tree order the gear comes before Start — the segmented row under the court.
  const order = within(surface)
    .getAllByTestId(/^(drill-settings-button|primary-action)$/)
    .map((n) => n.props.testID);
  expect(order).toEqual(["drill-settings-button", "primary-action"]);
});

test("the drill court is clean — no centre card over the schema", async () => {
  const t = await connectedTransport();
  panel(t);
  // CourtMap only draws its frosted centre card for centre children; the drill
  // surface passes none now, so the court stays clear.
  expect(screen.queryByTestId("centre-card")).toBeNull();
});

// Regression: the tab bar is a floating, translucent bar the scene extends
// UNDER, so the scrolling column must pad its BOTTOM by the bar's full footprint
// (tabBarClearance) plus the centre disc's upward poke — otherwise the last item
// (Start, when the config is short) is hidden behind the bar. The pad is derived
// from the bar's own exported geometry so a bar resize can't re-hide it.
test("the scrolling column clears the floating tab bar and its centre disc", async () => {
  const t = await connectedTransport();
  panel(t);
  const cc = StyleSheet.flatten(
    screen.getByTestId("drill-surface").props.contentContainerStyle,
  );
  // insets are 0 in jest → tabBarClearance(0) + disc rise + the gap.
  expect(cc.paddingBottom).toBe(tabBarClearance(0) + TAB_BAR_DISC_RISE + 12);
  // And it genuinely clears both the bar row and the poking disc.
  expect(cc.paddingBottom).toBeGreaterThanOrEqual(
    TAB_BAR_ROW_H + TAB_BAR_DISC_RISE,
  );
});

// The per-mode descriptions moved off an always-on line into a modal opened
// from the info icon by the Mode selector — so the setup stays compact but the
// explanations are still one tap away. Tapping the icon shows every mode's copy;
// the backdrop dismisses.
test("the mode info icon opens a modal describing each drill mode", async () => {
  const t = await connectedTransport();
  panel(t);

  // No modal, and no inline description, until asked for.
  expect(screen.queryByTestId("mode-info")).toBeNull();
  expect(screen.queryByText(/Targets light in a random order/)).toBeNull();

  // The info icon lives on the drill-setup page, beside the Mode selector.
  openSetup();
  fireEvent.press(screen.getByTestId("mode-info-button"));

  // Every mode's name + description is listed in the modal.
  expect(screen.getByTestId("mode-info")).toBeTruthy();
  expect(screen.getByText(/Targets light in a random order/)).toBeTruthy();
  expect(screen.getByText(/Run a fixed sequence/)).toBeTruthy();
  expect(screen.getByText(/Light targets by hand/)).toBeTruthy();

  // The backdrop dismisses.
  fireEvent.press(screen.getByTestId("mode-info-backdrop"));
  expect(screen.queryByTestId("mode-info")).toBeNull();
});

// The idle Start is the page's hero: a solid accent fill (not a plain outline
// chip like Mode/length), and it's balanced with a bottom margin so it sits
// centred between the court and the Mode row rather than hugging the modes.
test("the idle Start is an accent hero button, its row centred below the court", async () => {
  const t = await connectedTransport();
  panel(t);
  const s = StyleSheet.flatten(
    screen.getByTestId("primary-action").props.style,
  );
  expect(s.backgroundColor).toBe(colors.accent); // solid accent hero, not outline
  // The balance margin that centres the pair under the court rides the block
  // (gear + Start row plus the mode caption under it).
  const block = StyleSheet.flatten(
    screen.getByTestId("action-block").props.style,
  );
  expect(block.marginBottom).toBeGreaterThan(0);
});

// A muted caption under Start names what will run — the current mode and its
// key parameter — so the setup reads without opening the gear. It tracks the
// live config: the default random/10-hits, and updates when the mode changes.
test("idle: a mode caption under Start names the current setup", async () => {
  const t = await connectedTransport();
  panel(t);

  const caption = screen.getByTestId("mode-summary");
  expect(caption).toHaveTextContent("Random · 10 hits");
  // The caption is a SECOND LINE inside the Start button now, not a separate
  // row beneath it.
  expect(
    within(screen.getByTestId("primary-action")).getByTestId("mode-summary"),
  ).toBeTruthy();

  // Switch to Path on the setup page → the caption follows.
  selectMode("Path");
  expect(screen.getByTestId("mode-summary")).toHaveTextContent("Path");
});

// The gear is an outline square beside the full-width Start: a white fill with a
// thick accent border, kept square via aspectRatio (no flex, so only Start's
// width flexes), and BOTH buttons keep the normal rounded corners — no segmented
// squaring. It opens the drill-setup page.
test("the gear is a white outline square; both buttons keep rounded corners", async () => {
  const t = await connectedTransport();
  panel(t);

  const gear = StyleSheet.flatten(
    screen.getByTestId("drill-settings-button").props.style,
  );
  const start = StyleSheet.flatten(
    screen.getByTestId("primary-action").props.style,
  );
  // White fill, thick accent border — an outline gear, not a filled accent square.
  expect(gear.backgroundColor).toBe(colors.background);
  expect(gear.borderColor).toBe(colors.accent);
  expect(gear.borderWidth).toBeGreaterThan(1);
  // Square (width tracks height) and no flex, so only Start's width flexes.
  expect(gear.aspectRatio).toBe(1);
  expect(gear.flex).toBeUndefined();
  // Neither button squares its corners — both keep the base rounded radius.
  expect(gear.borderTopRightRadius).toBeUndefined();
  expect(start.borderTopLeftRadius).toBeUndefined();
  expect(start.borderRadius).toBeGreaterThan(0);
});

// The drill setup is a real pushed route on the Drill tab's nested native-stack
// now (not a Modal): the gear PUSHES it — so it isn't mounted until opened, and
// slides in over the still-mounted drill surface — and Done POPS back to the
// surface. This is what gives the horizontal overlay transition (the navigator's
// own), replacing the hand-rolled slide.
test("the drill setup is a pushed nav route — the gear opens it, Done pops back", async () => {
  const t = await connectedTransport();
  panel(t);

  // Not mounted until pushed; the surface is what's up.
  expect(screen.queryByTestId("drill-settings-page")).toBeNull();
  expect(screen.getByTestId("drill-surface")).toBeTruthy();

  openSetup();
  expect(screen.getByTestId("drill-settings-page")).toBeTruthy();

  closeSetup();
  // Popped: the setup page is gone and the drill surface is back.
  expect(screen.queryByTestId("drill-settings-page")).toBeNull();
  expect(screen.getByTestId("drill-surface")).toBeTruthy();
});

// No divider under the primary action — the action row is followed straight by
// the config band. The gear fills the row's FULL height (alignItems stretch) and
// stays square (aspectRatio), so only Start's width flexes beside it.
test("idle: the gear fills the row height as a square, with no divider below Start", async () => {
  const t = await connectedTransport();
  panel(t);
  expect(screen.queryByTestId("action-divider")).toBeNull();

  const row = StyleSheet.flatten(screen.getByTestId("action-row").props.style);
  expect(row.alignItems).toBe("stretch");
  const gear = StyleSheet.flatten(
    screen.getByTestId("drill-settings-button").props.style,
  );
  expect(gear.aspectRatio).toBe(1); // square, tracking the row height
});
