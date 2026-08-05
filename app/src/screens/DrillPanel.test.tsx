import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { MockCentralTransport } from "../ble/mock";
import type { DrillConfig } from "../ble/transport";
import { DrillPanel } from "./DrillPanel";

// Left-side layout from a pairing round: slot 0 = net left (0),
// slot 1 = mid left (7), slot 2 = back left (6).
const PAIRED = [0, 7, 6];

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
  render(<DrillPanel transport={t} pairedSpots={[]} />);
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy();
  expect(screen.queryByText("Load drill")).toBeNull();
});

test("random mode loads count/delay/timeout/repeat over the paired layout", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} />);

  // count 10 → 12, delay 0 → 500 ms, timeout 0 → 1000 ms, repeat on.
  fireEvent.press(screen.getByLabelText("Increase Targets to hit"));
  fireEvent.press(screen.getByLabelText("Increase Targets to hit"));
  fireEvent.press(screen.getByLabelText("Increase Delay between targets"));
  fireEvent.press(screen.getByLabelText("Increase Timeout (auto-miss)"));
  fireEvent.press(screen.getByLabelText("Increase Timeout (auto-miss)"));
  fireEvent(screen.getByLabelText("Allow immediate repeat"), "valueChange", true);

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

test("path mode authors positions by tapping paired spots — slot-index wire format", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Path"));
  // Only paired spots are offered; unpaired stay off.
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(3);
  expect(screen.getByTestId("spot-2-off")).toBeTruthy();
  // Empty path can't be loaded.
  expect(screen.getByText("Load drill")).toBeTruthy();
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
  // Canonical spots 6/0/6 are slots 2/0/2 in the paired order.
  expect(load).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "path", numPositions: 3, path: [2, 0, 2] }),
  );
});

test("path Undo drops the last step; Clear empties the sequence", async () => {
  const t = await connectedTransport();
  render(<DrillPanel transport={t} pairedSpots={PAIRED} />);

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

test("time mode sends a duration window; live mode strips inapplicable params", async () => {
  const t = await connectedTransport();
  const load = jest.spyOn(t, "loadDrill");
  render(<DrillPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Time"));
  fireEvent.press(screen.getByLabelText("Increase Duration")); // 60 → 75 s
  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "time", durationMs: 75000 }),
  );
  expect(load).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ count: expect.anything() }),
  );

  fireEvent.press(screen.getByText("Live"));
  // Live: only the timeout param is offered (no delay/count/duration/repeat).
  expect(screen.queryByText("Delay between targets")).toBeNull();
  expect(screen.queryByText("Targets to hit")).toBeNull();
  expect(screen.getByText("Timeout (auto-miss)")).toBeTruthy();
  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(load).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "live", numPositions: 3 }),
  );
});

test("editing after a load invalidates the loaded state", async () => {
  const t = await connectedTransport();
  render(<DrillPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Drill loaded — ready to start")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Increase Targets to hit"));
  expect(screen.queryByText("Drill loaded — ready to start")).toBeNull();
  expect(screen.getByText("Load drill")).toBeTruthy();
});

test("a rejected load surfaces as an inline error, not a crash", async () => {
  const t = await connectedTransport();
  jest
    .spyOn(t, "loadDrill")
    .mockRejectedValueOnce(new Error("write failed"));
  render(<DrillPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Load drill"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("write failed")).toBeTruthy();
  expect(screen.getByText("Load drill")).toBeTruthy(); // still retryable
});
