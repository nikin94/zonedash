import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { MockCentralTransport } from "../../ble/mock";
import { PairingPanel } from "./PairingPanel";

// Zero latency + a fixed, small tap delay so the two-tap confirm lands at
// deterministic times (candidate at tapDelayMs, bind at 2×) — the app leaves
// the tap delay random (750–1000 ms).
const connectedTransport = async () => {
  const t = new MockCentralTransport({ latencyMs: 0, stepMs: 100, tapDelayMs: 50 });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  return t;
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const startRound = async () => {
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync()); // round opens, waiting for a pick
};

// Place and two-tap-confirm a target at canonical spot i (unbound → bound).
const bindSpot = async (i: number) => {
  fireEvent.press(screen.getByTestId(`spot-${i}-pulse`));
  await act(() => jest.runAllTimersAsync());
};

test("idle: Start pairing over an empty court — no count picker", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryByTestId("count-pill")).toBeNull(); // the wheel is gone
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8);
  // Nothing to correct or finish before a round opens.
  expect(screen.queryByTestId("undo-pairing")).toBeNull();
  expect(screen.queryByTestId("finish-pairing")).toBeNull();
});

test("a round opens at the max — every unbound spot pulses, inviting a tap", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  await startRound();
  expect(screen.getByText("Tap the map to place target 1")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-pulse/)).toHaveLength(8);
});

test("placing a target: pulse → prompt (spinner) → confirm → bound", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Press the net left target")).toBeTruthy();
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();

  await act(() => jest.advanceTimersByTimeAsync(50)); // candidate
  expect(screen.getByText("Press again to confirm")).toBeTruthy();
  expect(screen.getByTestId("spot-0-confirm")).toBeTruthy();

  await act(() => jest.advanceTimersByTimeAsync(50)); // bind
  expect(screen.getByText("Tap the map to place target 2")).toBeTruthy();
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();
});

test("unbound spots keep pulsing while a prompt is up — no dip to off", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // prompt phase
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-pulse/)).toHaveLength(7);
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(0);
});

test("Finish appears after the first bind and ends the round early, keeping binds", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  // No Finish/Undo before anything is bound.
  expect(screen.queryByTestId("finish-pairing")).toBeNull();
  expect(screen.queryByTestId("undo-pairing")).toBeNull();

  await bindSpot(0);
  await bindSpot(7);
  expect(screen.getByTestId("finish-pairing")).toBeTruthy();

  // Finishing with < 8 always confirms (auto-complete handles the full 8).
  fireEvent.press(screen.getByTestId("finish-pairing"));
  expect(screen.getByText("Finish with 2 of 8 targets?")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Finish")[1]); // the confirm's action
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("Paired 2 targets")).toBeTruthy();
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();
  expect(screen.getByTestId("spot-7-bound")).toBeTruthy();
  // The unplaced spots go dark once the round is done — no more pulsing.
  expect(screen.queryAllByTestId(/spot-\d-pulse/)).toHaveLength(0);
});

test("Finish confirm can be dismissed with Keep going", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();
  await bindSpot(0);

  fireEvent.press(screen.getByTestId("finish-pairing"));
  expect(screen.getByTestId("finish-confirm")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Keep going")[0]);
  expect(screen.queryByTestId("finish-confirm")).toBeNull();
  // Still mid-round: the first bind stands, target 2 awaited.
  expect(screen.getByText("Tap the map to place target 2")).toBeTruthy();
});

test("binding all 8 completes the round automatically — no Finish needed", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  for (let i = 0; i < 8; i++) await bindSpot(i);
  expect(screen.getByText("Paired 8 targets")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-bound/)).toHaveLength(8);
});

test("Cancel confirms before discarding the round; Keep going aborts nothing", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();
  await bindSpot(0);

  fireEvent.press(screen.getByTestId("cancel-pairing"));
  expect(screen.getByText("Cancel pairing?")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Keep going")[0]);
  expect(screen.queryByTestId("cancel-confirm")).toBeNull();
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy(); // bind survived

  // Confirming Cancel drops everything back to idle.
  fireEvent.press(screen.getByTestId("cancel-pairing"));
  fireEvent.press(screen.getAllByText("Cancel")[1]); // the danger action in the modal
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // map reset
});

test("Undo is offered between binds (never mid-prompt) and rolls back the last bind", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  // Mid-prompt: no Undo while a pick is in flight.
  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.queryByTestId("undo-pairing")).toBeNull();

  await act(() => jest.runAllTimersAsync()); // spot 0 bound, choosing again
  expect(screen.getByTestId("undo-pairing")).toBeTruthy();

  fireEvent.press(screen.getByTestId("undo-pairing"));
  await act(() => jest.runAllTimersAsync());
  // Bind rolled back: spot 0 pulses again, back to placing target 1.
  expect(screen.getByText("Tap the map to place target 1")).toBeTruthy();
  expect(screen.getByTestId("spot-0-pulse")).toBeTruthy();
});

test("a bound spot cannot be picked again", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();
  await bindSpot(4);

  fireEvent.press(screen.getByTestId("spot-4-bound")); // no-op
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Tap the map to place target 2")).toBeTruthy();
});

test("startPairing rejection surfaces as an error, not a crash", async () => {
  const t = await connectedTransport();
  t.startPairing = jest.fn().mockRejectedValue(new Error("write failed"));
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("write failed")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy(); // back to idle
});

test("shows the net side for orientation", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  expect(screen.getByText("NET")).toBeTruthy();
});

// Regression: the court-centre info block keeps a fixed footprint — the status
// text, error line, and Finish row live in always-mounted fixed-height slots, so
// phase changes can't shift the label or the buttons around.
test("info-block slots stay mounted through every round phase", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  expect(screen.getByTestId("status-slot")).toBeTruthy();
  expect(screen.getByTestId("error-slot")).toBeTruthy();

  await startRound();
  expect(screen.getByTestId("status-slot")).toBeTruthy();
  expect(screen.getByTestId("error-slot")).toBeTruthy();
  expect(screen.getByTestId("finish-slot")).toBeTruthy(); // holds space pre-bind

  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByTestId("finish-slot")).toBeTruthy(); // prompting

  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("finish-slot")).toBeTruthy(); // bound → Finish shows
  expect(screen.getByTestId("finish-pairing")).toBeTruthy();
});
