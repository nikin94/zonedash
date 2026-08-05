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

test("map taps toggle spots and the count pill tracks the selection", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  // Default: all 8 canonical spots selected, none off.
  expect(screen.getByTestId("count-pill")).toHaveTextContent("8");
  expect(screen.queryAllByTestId(/spot-\d-selected/)).toHaveLength(8);

  // Deselect two spots on the map.
  fireEvent.press(screen.getByTestId("spot-1-selected"));
  fireEvent.press(screen.getByTestId("spot-5-selected"));
  expect(screen.getByTestId("count-pill")).toHaveTextContent("6");
  expect(screen.getByTestId("spot-1-off")).toBeTruthy();

  // Tapping an off spot re-selects it.
  fireEvent.press(screen.getByTestId("spot-1-off"));
  expect(screen.getByTestId("count-pill")).toHaveTextContent("7");
});

test("the last selected spot cannot be removed (layout keeps at least 1)", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  // Turn everything off except spot 0…
  for (const i of [1, 2, 3, 4, 5, 6, 7]) {
    fireEvent.press(screen.getByTestId(`spot-${i}-selected`));
  }
  expect(screen.getByTestId("count-pill")).toHaveTextContent("1");
  // …then the remaining spot refuses to toggle off.
  fireEvent.press(screen.getByTestId("spot-0-selected"));
  expect(screen.getByTestId("count-pill")).toHaveTextContent("1");
  expect(screen.getByTestId("spot-0-selected")).toBeTruthy();
});

test("count pill opens the wheel; picking N applies the corners-first preset", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  expect(screen.queryByTestId("count-wheel")).toBeNull();
  fireEvent.press(screen.getByTestId("count-pill"));
  expect(screen.getByTestId("count-wheel")).toBeTruthy();

  // Drive the wheel the way a scroll settle would.
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 4, label: "4" } }));

  expect(screen.getByTestId("count-pill")).toHaveTextContent("4");
  // N=4 preset = the four corners (0, 2, 4, 6).
  for (const i of [0, 2, 4, 6]) {
    expect(screen.getByTestId(`spot-${i}-selected`)).toBeTruthy();
  }
  for (const i of [1, 3, 5, 7]) {
    expect(screen.getByTestId(`spot-${i}-off`)).toBeTruthy();
  }
});

test("the round lights spots on the map with a confirm phase and finishes", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  // Pick the 3-spot preset: corners 0, 2 + back-right 4.
  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 3, label: "3" } }));

  fireEvent.press(screen.getByText("Start pairing"));

  // First prompt: canonical spot 0 is active on the map, named in the text.
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Press the net left target (1/3)")).toBeTruthy();
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();
  expect(screen.getByTestId("spot-2-pending")).toBeTruthy();

  // Confirm phase: same spot switches to the confirm state.
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByText("Press again to confirm")).toBeTruthy();
  expect(screen.getByTestId("spot-0-confirm")).toBeTruthy();

  // Next prompt: spot 0 bound, spot 2 active.
  await act(() => jest.advanceTimersByTimeAsync(50));
  expect(screen.getByText("Press the net right target (2/3)")).toBeTruthy();
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();
  expect(screen.getByTestId("spot-2-active")).toBeTruthy();

  // Round completes → all round spots bound, re-pair affordance back.
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 3 targets")).toBeTruthy();
  expect(screen.getByTestId("spot-4-bound")).toBeTruthy();
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

test("cancel during a round returns to idle and stops further prompts", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // first prompt is up
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();

  fireEvent.press(screen.getByText("Cancel"));
  await act(() => jest.runAllTimersAsync()); // no further prompts may land

  expect(screen.getByText("Start pairing")).toBeTruthy(); // back to idle
  expect(screen.queryByText(/Press the/)).toBeNull();
  expect(screen.getByTestId("spot-0-selected")).toBeTruthy(); // map back to selection
});

test("a dropped link mid-round surfaces a message instead of vanishing", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.advanceTimersByTimeAsync(0));

  await act(async () => {
    await t.disconnect(); // link drops mid-round
  });
  expect(screen.getByText("connection lost")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy();
});

test("changing the layout clears the stale 'Paired N' text", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 8 targets")).toBeTruthy();

  fireEvent.press(screen.getByTestId("spot-3-bound")); // toggle a spot post-round
  expect(screen.queryByText(/Paired/)).toBeNull();
});

test("shows the net side for orientation", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  expect(screen.getByText("NET")).toBeTruthy();
});
