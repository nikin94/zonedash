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

  // Drive the wheel the way a scroll settle would: a NEW value closes it.
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 3, label: "3" } }));

  expect(screen.getByTestId("count-pill")).toHaveTextContent("3");
  expect(screen.queryByTestId("count-wheel")).toBeNull(); // auto-closed
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // still nothing lit

  // Settling on the unchanged value keeps the wheel open (pill dismisses it).
  fireEvent.press(screen.getByTestId("count-pill"));
  const reopened = screen.UNSAFE_getByType(WheelPicker);
  act(() => reopened.props.onValueChanged({ item: { value: 3, label: "3" } }));
  expect(screen.getByTestId("count-wheel")).toBeTruthy();
  fireEvent.press(screen.getByTestId("count-pill"));
  expect(screen.queryByTestId("count-wheel")).toBeNull();
});

test("tapping outside the open wheel closes it without changing the value", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByTestId("count-pill"));
  expect(screen.getByTestId("count-wheel")).toBeTruthy();

  // The backdrop catches any tap outside the dropdown.
  fireEvent.press(screen.getByTestId("wheel-backdrop"));
  expect(screen.queryByTestId("count-wheel")).toBeNull();
  expect(screen.getByTestId("count-pill")).toHaveTextContent("8"); // unchanged
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
  // Realistic composition: still CONNECTED (App only mounts the panel then),
  // but the write itself fails — how a real BLE Control write rejects.
  const t = await connectedTransport();
  t.startPairing = jest.fn().mockRejectedValue(new Error("write failed"));
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("write failed")).toBeTruthy();
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

// No link-loss test here on purpose: App unmounts the panel the moment the
// connection drops (it mounts the panel only while connected), so a panel-local
// handler could never render — App's status row owns and shows the reason.

test("idle spots stay 'available' through the whole bind cycle — no re-blink", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync()); // choosing: all spots available

  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.advanceTimersByTimeAsync(0)); // prompt phase
  expect(screen.getByTestId("spot-0-active")).toBeTruthy();
  // The other 7 spots must NOT dip to "off" while the prompt is up — that dip
  // is exactly what read as a double blink per bind.
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(7);

  await act(() => jest.advanceTimersByTimeAsync(50)); // confirm phase
  expect(screen.getByTestId("spot-0-confirm")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-available/)).toHaveLength(7);
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(0);
});

// Pairs 2 targets to completion (spots 0 and 2) so "done" state is reached.
const pairTwo = async () => {
  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 2, label: "2" } }));
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-2-available"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 2 targets")).toBeTruthy();
};

test("increasing the count after a completed round offers Add (no reset); No keeps everything", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await pairTwo();

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 5, label: "5" } }));

  // Growing is non-destructive — the Add dialog, not the reset one.
  expect(screen.getByTestId("count-extend")).toBeTruthy();
  expect(screen.queryByTestId("count-confirm")).toBeNull();
  expect(screen.getByText("Add 3 more targets?")).toBeTruthy();
  expect(screen.getByTestId("count-pill")).toHaveTextContent("2"); // not committed

  fireEvent.press(screen.getByText("No"));
  expect(screen.queryByTestId("count-extend")).toBeNull();
  expect(screen.getByTestId("count-pill")).toHaveTextContent("2"); // reverted
  expect(screen.getByText("Paired 2 targets")).toBeTruthy(); // map intact
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();
});

test("Add resumes the round: bound spots stay, the extra target is placed and bound", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await pairTwo();

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 3, label: "3" } }));
  fireEvent.press(screen.getByText("Add"));
  await act(() => jest.runAllTimersAsync()); // round resumes, waiting for a pick

  expect(screen.getByTestId("count-pill")).toHaveTextContent("3"); // committed
  expect(screen.getByText("Tap the map where target 3 of 3 stands")).toBeTruthy();
  // The two previously bound spots survived the extend.
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy();
  expect(screen.getByTestId("spot-2-bound")).toBeTruthy();

  fireEvent.press(screen.getByTestId("spot-6-available"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 3 targets")).toBeTruthy();
  for (const i of [0, 2, 6]) {
    expect(screen.getByTestId(`spot-${i}-bound`)).toBeTruthy();
  }
});

test("decreasing the count still requires the destructive reset confirm", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await pairTwo();

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 1, label: "1" } }));

  // Shrinking can't keep the map (which bound target would go?) — reset dialog.
  expect(screen.getByTestId("count-confirm")).toBeTruthy();
  expect(screen.getByText("Change target count to 1?")).toBeTruthy();

  fireEvent.press(screen.getByText("Yes"));
  expect(screen.getByTestId("count-pill")).toHaveTextContent("1"); // committed
  expect(screen.queryByText(/Paired/)).toBeNull(); // done state discarded
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // map back to idle
  expect(screen.getByText("Start pairing")).toBeTruthy(); // operator restarts
});

test("before any pairing, a count change needs no confirmation", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 4, label: "4" } }));

  expect(screen.queryByTestId("count-confirm")).toBeNull();
  expect(screen.getByTestId("count-pill")).toHaveTextContent("4");
});

test("Undo appears between binds and reopens the last bound spot", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 2, label: "2" } }));
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());

  // First pick in flight: no Undo while a prompt is up.
  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expect(screen.queryByText("Undo")).toBeNull();

  await act(() => jest.runAllTimersAsync()); // spot 0 bound, choosing again
  expect(screen.getByText("Undo")).toBeTruthy();

  fireEvent.press(screen.getByText("Undo"));
  await act(() => jest.runAllTimersAsync());
  // Bind rolled back: spot 0 is offered again, still target 1 of 2.
  expect(screen.getByText("Tap the map where target 1 of 2 stands")).toBeTruthy();
  expect(screen.getByTestId("spot-0-available")).toBeTruthy();
});

test("Undo from a completed round resumes it with the last spot reopened", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  await pairTwo(); // spots 0 and 2 bound, "Paired 2 targets"

  fireEvent.press(screen.getByText("Undo"));
  await act(() => jest.runAllTimersAsync());

  expect(screen.getByText("Tap the map where target 2 of 2 stands")).toBeTruthy();
  expect(screen.getByTestId("spot-0-bound")).toBeTruthy(); // first bind kept
  expect(screen.getByTestId("spot-2-available")).toBeTruthy(); // rolled back

  fireEvent.press(screen.getByTestId("spot-6-available")); // rebind elsewhere
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 2 targets")).toBeTruthy();
  expect(screen.getByTestId("spot-6-bound")).toBeTruthy();
});

test("no Undo before anything is bound", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync()); // choosing, zero binds
  expect(screen.queryByText("Undo")).toBeNull();
});

test("shows the net side for orientation", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);
  expect(screen.getByText("NET")).toBeTruthy();
});

// Regression: the court-centre info block must keep a fixed footprint — the
// status text, error line, and Undo row live in always-mounted fixed-height
// slots, so phase changes can't shift the label or the buttons around.
test("info-block slots stay mounted through every round phase", async () => {
  const t = await connectedTransport();
  render(<PairingPanel transport={t} />);

  const expectSlots = () => {
    expect(screen.getByTestId("status-slot")).toBeTruthy();
    expect(screen.getByTestId("error-slot")).toBeTruthy();
    expect(screen.getByTestId("undo-slot")).toBeTruthy();
  };

  expectSlots(); // idle

  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  expectSlots(); // choosing (no Undo button, but its slot holds the space)
  expect(screen.queryByText("Undo")).toBeNull();

  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  expectSlots(); // prompting

  await act(() => jest.advanceTimersByTimeAsync(50));
  expectSlots(); // awaiting confirm

  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-2-available"));
  await act(() => jest.runAllTimersAsync());
  // Later binds: keep driving until the round completes.
  while (screen.queryByText(/Tap the map where target/) !== null) {
    const next = screen.queryAllByTestId(/spot-\d-available/)[0];
    if (!next) break;
    fireEvent.press(next);
    await act(() => jest.runAllTimersAsync());
  }
  expect(screen.getByText(/Paired \d/)).toBeTruthy();
  expectSlots(); // done — Undo button present inside its slot
  expect(screen.getByText("Undo")).toBeTruthy();
});
