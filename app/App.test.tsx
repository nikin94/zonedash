import WheelPicker from "@quidone/react-native-wheel-picker";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import App from "./App";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const renderApp = async () => {
  render(<App />);
  // Let the navigation container settle its initial state.
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

const connect = async () => {
  fireEvent.press(screen.getByTestId("status-chip"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

// Pairs two targets (spots 0 and 2) on the Pairing screen — connect() already
// landed there — then backs out to the home screen.
const pairTwoAndGoHome = async () => {
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
  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

test("renders the exercise home with the disconnected state", async () => {
  await renderApp();
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("offline")).toBeTruthy(); // header status chip
  expect(screen.getByText(/Not connected — tap the status/)).toBeTruthy();
});

// There is no empty "pair your targets first" screen: an unpaired session has
// nothing to do at home, so connecting lands straight on the Pairing screen.
test("connecting goes straight to the Pairing screen", async () => {
  await renderApp();
  await connect();
  expect(screen.getByText("mock")).toBeTruthy(); // brief connected label
  expect(screen.getByText("Targets")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryByText(/Pair your targets first/)).toBeNull();
});

// Before a layout exists there is nowhere to go back TO — home would redirect
// straight back here, so the back button must not exist at all (a visible
// button that returns to the same screen reads as broken).
test("Pairing has no back button until a round completes", async () => {
  await renderApp();
  await connect();

  expect(screen.queryByTestId("header-back")).toBeNull();

  // Pair two targets — the way back appears once there is a layout.
  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 2, label: "2" } }));
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.queryByTestId("header-back")).toBeNull(); // mid-round: still none
  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-2-available"));
  await act(() => jest.runAllTimersAsync());
  expect(screen.getByText("Paired 2 targets")).toBeTruthy();
  expect(screen.getByTestId("header-back")).toBeTruthy();
});

test("after pairing, back lands on the drill home; the chip menu reopens Pairing", async () => {
  await renderApp();
  await connect();
  await pairTwoAndGoHome();

  // Home now offers the drill config over the paired layout — no hint screen.
  expect(screen.getByText("Random")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();

  // The chip menu still reaches Pairing (e.g. to re-pair). The screen mounts
  // fresh — it mirrors the central's events, so it opens idle.
  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByTestId("chip-menu")).toBeTruthy();
  fireEvent.press(screen.getByText("Pairing"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Start pairing")).toBeTruthy();

  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Random")).toBeTruthy(); // home again, layout kept
});

test("an outside tap closes the chip menu without navigating", async () => {
  await renderApp();
  await connect();

  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByTestId("chip-menu")).toBeTruthy();
  fireEvent.press(screen.getByTestId("chip-menu-backdrop"));
  expect(screen.queryByTestId("chip-menu")).toBeNull();
  expect(screen.getByText("Start pairing")).toBeTruthy(); // still on Pairing
});

test("Disconnect lives in the chip menu behind the confirm — No keeps the link", async () => {
  await renderApp();
  await connect();

  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  expect(screen.getByText("Disconnect from the central unit?")).toBeTruthy();

  fireEvent.press(screen.getByText("No"));
  expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
  expect(screen.getByText("mock")).toBeTruthy(); // still connected

  // Yes actually disconnects and lands back on the (offline) home screen.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("offline")).toBeTruthy();
  expect(screen.getByText(/Not connected — tap the status/)).toBeTruthy();
});

// Regression: pairedSpots is an app-side cache of state that lives on the
// brain and is built fresh each session. A reconnect can land on a rebooted
// (or different) central with no map — the cache must not survive the link.
test("a disconnect clears the paired layout — reconnect starts at Pairing again", async () => {
  await renderApp();
  await connect();
  await pairTwoAndGoHome();
  expect(screen.getByText("Random")).toBeTruthy();

  // Disconnect, then reconnect — the fresh session never paired anything.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  await connect();

  // The stale layout must be gone — no phantom builder; the app is back on
  // the Pairing screen with a clean map.
  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryByText("Random")).toBeNull();
  expect(screen.queryAllByTestId(/spot-\d-bound/)).toHaveLength(0);
});

test("the settings button opens the Settings screen — no timeout setting exists", async () => {
  await renderApp();
  await connect();
  await pairTwoAndGoHome(); // the settings button lives on the home header

  fireEvent.press(screen.getByTestId("settings-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Drill settings")).toBeTruthy();
  expect(screen.getByText("Delay between targets")).toBeTruthy();
  expect(screen.getByText("Same target twice in a row")).toBeTruthy();
  expect(screen.queryByText(/Timeout/)).toBeNull(); // misses don't exist

  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("mock")).toBeTruthy(); // home again, still connected
});
