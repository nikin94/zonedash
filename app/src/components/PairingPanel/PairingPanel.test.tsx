import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { StyleSheet } from "react-native";

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
  fireEvent.press(screen.getByTestId("start-pairing"));
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

  expect(screen.getByTestId("start-pairing")).toBeTruthy();
  expect(screen.queryByTestId("count-pill")).toBeNull(); // the wheel is gone
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8);
  // The round controls don't exist before a round opens (idle shows Start).
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

test("placing a target: pulse → prompt (ping) → confirm → bound", async () => {
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

test("the other spots freeze (static, not off) while a prompt is up, then pulse again once it binds", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  // Choosing: all 8 breathe, inviting the first tap.
  expect(screen.queryAllByTestId(/spot-\d-pulse/)).toHaveLength(8);

  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // prompt phase
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();
  // Focus is on the one being placed: the other 7 go static (available), not
  // pulsing and not dark.
  expect(screen.queryAllByTestId(/spot-\d-pulse/)).toHaveLength(0);
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(7);
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(0);

  // Bound (check shown) → choosing again → the remaining unbound spots resume
  // pulsing.
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-pulse/)).toHaveLength(7);
});

test("Finish enables after the first bind and ends the round early, keeping binds", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  // Finish/Undo are shown from the start of the round, disabled until a bind.
  expect(screen.getByTestId("finish-pairing")).toBeDisabled();
  expect(screen.getByTestId("undo-pairing")).toBeDisabled();

  await bindSpot(0);
  await bindSpot(7);
  expect(screen.getByTestId("finish-pairing")).toBeEnabled();

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
  expect(screen.getByTestId("start-pairing")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // map reset
});

test("Undo is offered between binds (never mid-prompt) and rolls back the last bind", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await startRound();

  // Mid-prompt: Undo is present but disabled while a pick is in flight.
  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByTestId("undo-pairing")).toBeDisabled();

  await act(() => jest.runAllTimersAsync()); // spot 0 bound, choosing again
  expect(screen.getByTestId("undo-pairing")).toBeEnabled();

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

  fireEvent.press(screen.getByTestId("start-pairing"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("write failed")).toBeTruthy();
  expect(screen.getByTestId("start-pairing")).toBeTruthy(); // back to idle
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
  expect(screen.getByTestId("finish-pairing")).toBeDisabled(); // shown pre-bind

  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByTestId("finish-pairing")).toBeDisabled(); // prompting

  await act(() => jest.runAllTimersAsync());
  expect(screen.getByTestId("finish-pairing")).toBeEnabled(); // bound → enabled
});

// Idle, pairing and drill swap in place inside one ScreenWrapper, which owns the
// single shared top offset — so no surface may carry a top margin of its own, or
// it would drift out of sync and snap the court vertically. Locks the pairing
// surface at zero top margin.
test("the pairing surface carries no top margin — the offset is on ScreenWrapper", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  const style = StyleSheet.flatten(screen.getByTestId("pairing-surface").props.style);
  expect(style.marginTop).toBeUndefined();
});

// Layout: the court is clean (no centre card), and the action + status live
// OUTSIDE it, below — Start reads "Start pairing" and the hint sits under it.
test("idle layout: clean court, Start pairing hero, hint under the button", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  // No centre card over the schema — CourtMap draws it only for centre children.
  expect(screen.queryByTestId("centre-card")).toBeNull();
  // The idle action reads "Start pairing" (not the old "Start").
  expect(screen.getByText("Start pairing")).toBeTruthy();
  // The hint sits below and references the button.
  expect(screen.getByText(/Tap Start pairing/)).toBeTruthy();
  // In tree order the action comes before the status slot — i.e. text is under
  // the button.
  const order = screen
    .getAllByTestId(/^(start-pairing|status-slot)$/)
    .map((n) => n.props.testID);
  expect(order).toEqual(["start-pairing", "status-slot"]);
});
