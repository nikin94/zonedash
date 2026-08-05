import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { MockCentralTransport } from "../ble/mock";
import { SessionPanel } from "./SessionPanel";

// Left-side layout from a pairing round: slot 0 = net left (0),
// slot 1 = mid left (7), slot 2 = back left (6).
const PAIRED = [0, 7, 6];

// Zero latency + a short step so fake timers drive the whole run explicitly.
const connectedTransport = async (missEvery = 0) => {
  const t = new MockCentralTransport({ latencyMs: 0, stepMs: 100, missEvery });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  return t;
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("without a paired layout the panel only hints at pairing", async () => {
  const t = await connectedTransport();
  render(<SessionPanel transport={t} pairedSpots={[]} />);
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy();
  expect(screen.queryByText("Start")).toBeNull();
});

test("a run arms spots, flashes hits, and ends in a summary", async () => {
  const t = await connectedTransport();
  // Path drill so the armed positions are fully deterministic:
  // slots 2, 0 → canonical spots 6, 0.
  await t.loadDrill({ mode: "path", numPositions: 3, path: [2, 0], timeoutMs: 0 });
  render(<SessionPanel transport={t} pairedSpots={PAIRED} />);

  expect(screen.getByText(/Runs the drill loaded/)).toBeTruthy();
  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // seq 0 armed

  // Step 1: slot 2 → back left (6) is prompted with the spinner.
  expect(screen.getByText("Step 1")).toBeTruthy();
  expect(screen.getByTestId("spot-6-active")).toBeTruthy();
  expect(screen.getByText("React when a target lights up")).toBeTruthy();

  // The step resolves as a hit → green flash + the reaction time.
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByTestId("spot-6-hit")).toBeTruthy();
  expect(screen.getByText("380 ms")).toBeTruthy();
  expect(screen.getByText("Step 2")).toBeTruthy();

  // Run out: second step resolves, session flips done, summary fetched.
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("2 hits · 0 misses")).toBeTruthy();
  expect(screen.getByText(/avg \d+ ms · best 380 ms/)).toBeTruthy();
  expect(screen.getByText("Run again")).toBeTruthy();
});

test("a timeout miss flashes red with a cross and counts in the summary", async () => {
  const t = await connectedTransport(2); // every 2nd step misses
  await t.loadDrill({
    mode: "path",
    numPositions: 3,
    path: [2, 0, 1], // a step AFTER the miss, so the flash shows mid-run
    timeoutMs: 1000, // misses only exist when a timeout is configured
  });
  render(<SessionPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Start"));
  // Step 2 (seq 1) is the miss: slot 0 → net left (0) flashes red.
  await act(() => jest.advanceTimersByTimeAsync(160)); // seq 1 just resolved
  expect(screen.getByTestId("spot-0-miss")).toBeTruthy();
  expect(screen.getByTestId("dot-cross")).toBeTruthy();
  expect(screen.getByText("Miss")).toBeTruthy();

  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("2 hits · 1 miss")).toBeTruthy();
});

test("the resolved flash clears back to available after its window", async () => {
  const t = await connectedTransport();
  await t.loadDrill({ mode: "path", numPositions: 3, path: [2, 0], timeoutMs: 0 });
  render(<SessionPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(50)); // seq 0 resolved
  expect(screen.getByTestId("spot-6-hit")).toBeTruthy();

  await act(() => jest.advanceTimersByTimeAsync(500)); // flash window passed
  expect(screen.queryByTestId("spot-6-hit")).toBeNull();
});

test("Stop aborts the run and still summarizes the partial records", async () => {
  const t = await connectedTransport();
  await t.loadDrill({
    mode: "path",
    numPositions: 3,
    path: [2, 0, 1],
    timeoutMs: 0,
  });
  render(<SessionPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.advanceTimersByTimeAsync(60)); // one step resolved

  fireEvent.press(screen.getByText("Stop"));
  await act(() => jest.runAllTimersAsync()); // no further steps may land

  expect(screen.getByText("1 hit · 0 misses")).toBeTruthy();
  expect(screen.getByText("Run again")).toBeTruthy();
  expect(screen.queryByText(/Step \d/)).toBeNull();
});

test("a failed start surfaces as an inline error, not a crash", async () => {
  const t = await connectedTransport();
  jest.spyOn(t, "startSession").mockRejectedValueOnce(new Error("write failed"));
  render(<SessionPanel transport={t} pairedSpots={PAIRED} />);

  fireEvent.press(screen.getByText("Start"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("write failed")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy(); // still retryable
});
