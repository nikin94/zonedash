import WheelPicker from "@quidone/react-native-wheel-picker";
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

test("count wheel opens over the pill and only sets the count — no map spots light", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  // Idle: every spot is a faint outline; picking a count must not change that.
  expect(screen.getByTestId("count-pill")).toHaveTextContent("8");
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8);

  expect(screen.queryByTestId("count-wheel")).toBeNull();
  fireEvent.press(screen.getByTestId("count-pill"));
  expect(screen.getByTestId("count-wheel")).toBeTruthy();

  // Drive the wheel the way a scroll settle would.
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 3, label: "3" } }));

  expect(screen.getByTestId("count-pill")).toHaveTextContent("3");
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // still nothing lit
});

test("spots are picked during the round — free-form, e.g. all on the left", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 3, label: "3" } }));

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync()); // round opens, waiting for a pick

  // Choose phase: the operator taps the map; every unbound spot is offered.
  expect(screen.getByText("Tap the map where target 1 of 3 stands")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(8);

  // Left side only: net left (0) → mid left (7) → back left (6).
  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Press the net left target (1/3)")).toBeTruthy();
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();

  // Two-tap confirm on the physical target.
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByText("Press again to confirm")).toBeTruthy();
  expect(screen.getByTestId("spot-0-confirm")).toBeTruthy();

  // Bound → back to choosing the next spot.
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByText("Tap the map where target 2 of 3 stands")).toBeTruthy();
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();

  fireEvent.press(screen.getByTestId("spot-7-available"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-6-available"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("Paired 3 targets")).toBeTruthy();
  for (const i of [0, 7, 6]) {
    expect(screen.getByTestId(`spot-${i}-bound`)).toBeTruthy();
  }
  expect(screen.getByText("Re-pair")).toBeTruthy();
});

test("a bound spot cannot be picked again", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 2, label: "2" } }));

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());

  fireEvent.press(screen.getByTestId("spot-4-available"));
  await act(() => jest.runAllTimersAsync()); // spot 4 bound

  fireEvent.press(screen.getByTestId("spot-4-bound")); // no-op
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Tap the map where target 2 of 2 stands")).toBeTruthy();
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

test("cancel during a round returns to idle and stops further prompts", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // prompt is up
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();

  fireEvent.press(screen.getByText("Cancel"));
  await act(() => jest.runAllTimersAsync()); // no further prompts may land

  expect(screen.getByText("Start pairing")).toBeTruthy(); // back to idle
  expect(screen.queryByText(/Press the/)).toBeNull();
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // map reset
});

test("a dropped link mid-round surfaces a message instead of vanishing", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());

  await act(async () => {
    await t.disconnect(); // link drops mid-round
  });
  expect(screen.getByText("connection lost")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy();
});

test("shows the net side for orientation", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  expect(screen.getByText("NET")).toBeTruthy();
});
