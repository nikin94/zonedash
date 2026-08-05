import WheelPicker from "@quidone/react-native-wheel-picker";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { MockCentralTransport } from "../ble/mock";
import type { DrillConfig } from "../ble/transport";
import { DrillPanel } from "./DrillPanel";
import { DEFAULT_SETTINGS, type DrillSettings } from "./SettingsPanel";

// Open a WheelField by testID and settle its wheel on `value` — one tap plus
// a scroll, the way the on-device control works.
const pickWheelValue = (testID: string, value: number, label: string) => {
  fireEvent.press(screen.getByTestId(testID));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value, label } }));
};

// Left-side layout from a pairing round: slot 0 = net left (0),
// slot 1 = mid left (7), slot 2 = back left (6).
const PAIRED = [0, 7, 6];

// Settings arrive from the App-level settings screen.
const SETTINGS: DrillSettings = {
  delayMs: 500,
  timeoutMs: 1000,
  allowImmediateRepeat: true,
};

const connectedTransport = async () => {
  const t = new MockCentralTransport({ latencyMs: 0, stepMs: 100 });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  return t;
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("without a paired layout the builder only hints at pairing", async () => {
  const t = await connectedTransport();
  render(<DrillPanel transport={t} pairedSpots={[]} settings={DEFAULT_SETTINGS} />);
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy();
  expect(screen.queryByText("Load drill")).toBeNull();
});

test("random / stop-by-hits loads count plus the screen settings", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

  // count 10 → 12 via the wheel; delay/timeout/repeat come from settings.
  pickWheelValue("drill-count", 12, "12");

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());

  expect(load).toHaveBeenCalledWith({
    mode: "random",
    numPositions: 3,
    count: 12,
    delayMs: 500,
    timeoutMs: 1000,
    allowImmediateRepeat: true,
  } satisfies DrillConfig);
  expect(screen.getByText("Drill loaded — ready to start")).toBeTruthy();
});

test("random / stop-by-time resolves to the engine's time mode with a duration", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

  // One Random mode, two stop conditions — no separate Time mode chip.
  expect(screen.queryByText("Time")).toBeTruthy(); // the stop-by chip
  fireEvent.press(screen.getByText("Time"));
  expect(screen.queryByText("Targets to hit")).toBeNull();
  pickWheelValue("drill-duration", 75000, "75 s"); // 60 → 75 s

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "time", durationMs: 75000 }),
  );
  expect(load).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ count: expect.anything() }),
  );

  // Switching back to Hits resolves to random again.
  fireEvent.press(screen.getByText("Hits"));
  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "random", count: 10 }),
  );
});

test("live mode sends exactly mode/positions/timeout — no delay or repeat leak", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

  fireEvent.press(screen.getByText("Live"));
  expect(screen.queryByText("Stop after")).toBeNull();
  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());

  expect(load).toHaveBeenLastCalledWith({
    mode: "live",
    numPositions: 3,
    timeoutMs: 1000,
  } satisfies DrillConfig);
});

test("path mode authors positions by tapping paired spots — slot-index wire format", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

  fireEvent.press(screen.getByText("Path"));
  // Only paired spots are offered; unpaired stay off.
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(3);
  expect(screen.getByTestId("spot-2-off")).toBeTruthy();
  // Empty path can't be loaded.
  fireEvent.press(screen.getByText("Load drill"));
  expect(load).not.toHaveBeenCalled();

  // Author: back left (6) → net left (0) → back left again (repeats allowed).
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByTestId("spot-6-active")); // 6 already in path → active
  expect(screen.getByTestId("path-sequence")).toHaveTextContent(
    "back left → net left → back left",
  );

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  // Canonical spots 6/0/6 are slots 2/0/2 in the paired order; path uses the
  // screen delay but no repeat (repeat only shapes the random pickers).
  expect(load).toHaveBeenCalledWith({
    mode: "path",
    numPositions: 3,
    timeoutMs: 1000,
    delayMs: 500,
    path: [2, 0, 2],
  } satisfies DrillConfig);
});

test("path Undo drops the last step; Clear empties the sequence", async () => {
  const t = await connectedTransport();
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

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
  expect(screen.getByText(/Tap paired spots in the order/)).toBeTruthy();
});

test("a re-pair filters the authored path and invalidates the loaded config", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  const { rerender } = render(
    <DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />,
  );

  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("spot-6-available"));
  fireEvent.press(screen.getByTestId("spot-0-available"));
  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Drill loaded — ready to start")).toBeTruthy();

  // Re-pair drops spot 6 (kept 0 and 7) — the stale step must vanish and the
  // loaded state reset; nothing may translate to position -1 / 255.
  rerender(<DrillPanel transport={t} pairedSpots={[0, 7]} settings={SETTINGS} />);
  expect(screen.getByTestId("path-sequence")).toHaveTextContent(/^net left$/);
  expect(screen.queryByText("Drill loaded — ready to start")).toBeNull();

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "path", numPositions: 2, path: [0] }),
  );

  // A full layout swap empties the path entirely — back to the authoring hint.
  rerender(<DrillPanel transport={t} pairedSpots={[1, 2, 3]} settings={SETTINGS} />);
  expect(screen.queryByTestId("path-sequence")).toBeNull();
  expect(screen.getByText(/Tap paired spots in the order/)).toBeTruthy();
});

test("editing after a load invalidates the loaded state", async () => {
  const t = await connectedTransport();
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Drill loaded — ready to start")).toBeTruthy();

  pickWheelValue("drill-count", 11, "11");
  expect(screen.queryByText("Drill loaded — ready to start")).toBeNull();
  expect(screen.getByText("Load drill")).toBeTruthy();
});

test("a settings change invalidates the loaded state and is used on reload", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  const { rerender } = render(
    <DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />,
  );

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Drill loaded — ready to start")).toBeTruthy();

  // The operator visits the settings screen and bumps the timeout.
  rerender(
    <DrillPanel
      transport={t}
      pairedSpots={PAIRED}
      settings={{ ...SETTINGS, timeoutMs: 2000 }}
    />,
  );
  expect(screen.queryByText("Drill loaded — ready to start")).toBeNull();

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeoutMs: 2000 }),
  );
});

test("a rejected load surfaces as an inline error, not a crash", async () => {
  const t = await connectedTransport();
  jest
    .spyOn(t, "loadDrill")
    .mockRejectedValueOnce(new Error("write failed"));
  render(<DrillPanel transport={t} pairedSpots={PAIRED} settings={SETTINGS} />);

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("write failed")).toBeTruthy();
  expect(screen.getByText("Load drill")).toBeTruthy(); // still retryable
});
