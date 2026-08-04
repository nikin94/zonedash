import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { MockCentralTransport } from "../ble/mock";
import { PairingPanel } from "./PairingPanel";

// Zero latency + fake timers so pairing steps are advanced explicitly.
const connectedTransport = async () => {
  const t = new MockCentralTransport({ latencyMs: 0, stepMs: 100 });
  const p = t.connect();
  await jest.runAllTimersAsync();
  await p;
  return t;
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("walks the prompts for the selected N and reports done", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("4")); // pick N=4
  fireEvent.press(screen.getByText("Start pairing"));

  // First prompt lands after the first mock step.
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Press slot 1 of 4")).toBeTruthy();
  expect(screen.getAllByTestId("slot-idle")).toHaveLength(3);

  // Two taps in: prompt 3, two slots bound.
  await act(() => jest.advanceTimersByTimeAsync(200));
  expect(screen.getByText("Press slot 3 of 4")).toBeTruthy();
  expect(screen.getAllByTestId("slot-bound")).toHaveLength(2);

  // Round completes → done state, re-pair affordance back.
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 4 targets")).toBeTruthy();
  expect(screen.getByText("Re-pair")).toBeTruthy();
});

test("startPairing rejection surfaces as an error, not a crash", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  // Force the command to reject the way a real BLE write can.
  await act(async () => {
    await t.disconnect();
  });
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("not connected")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy(); // back to idle
});

test("offers every layout size from 1 to 8", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  for (let n = 1; n <= 8; n++) {
    expect(screen.getByText(String(n))).toBeTruthy();
  }
});

test("N=1 pairs a single target", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("1"));
  fireEvent.press(screen.getByText("Start pairing"));

  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Press slot 1 of 1")).toBeTruthy();
  expect(screen.queryAllByTestId("slot-idle")).toHaveLength(0);

  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 1 target")).toBeTruthy();
});

test("defaults to 8 targets when no size is picked", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Press slot 1 of 8")).toBeTruthy();
});

test("shows the confirm phase (press again) after the first tap", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("2"));
  fireEvent.press(screen.getByText("Start pairing"));

  // Mid-slot the mock emits the awaiting-confirm phase (firmware Tap::Await).
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByText("Slot 1: press again to confirm")).toBeTruthy();
  expect(screen.getByTestId("slot-confirm")).toBeTruthy();

  // The second tap binds and moves the prompt on.
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByText("Press slot 2 of 2")).toBeTruthy();
});

test("cancel during a round returns to idle and stops further prompts", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("4"));
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.advanceTimersByTimeAsync(100)); // round in progress

  fireEvent.press(screen.getByText("Cancel"));
  await act(() => jest.runAllTimersAsync()); // cancelled — nothing more fires

  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryByText(/Press slot/)).toBeNull();
  expect(screen.queryByText(/Paired/)).toBeNull();
});

test("a dropped link mid-round surfaces a message instead of vanishing", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.advanceTimersByTimeAsync(100)); // round in progress

  await act(async () => {
    await t.disconnect();
  });

  expect(screen.getByText("connection lost")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy(); // not trapped
});

test("picking a new N clears the stale 'Paired N' text", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("2"));
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 2 targets")).toBeTruthy();

  fireEvent.press(screen.getByText("5")); // new pick — old result is stale
  expect(screen.queryByText("Paired 2 targets")).toBeNull();
  expect(screen.getByText("Start pairing")).toBeTruthy(); // not "Re-pair"
});
