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

test("renders the exercise home with the disconnected state", async () => {
  await renderApp();
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("offline")).toBeTruthy(); // header status chip
  expect(screen.getByText(/Not connected — tap the status/)).toBeTruthy();
});

test("tapping the status chip connects; without pairing the home hints at it", async () => {
  await renderApp();
  await connect();
  expect(screen.getByText("mock")).toBeTruthy(); // brief connected label
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy();
});

test("the chip menu opens the Pairing screen; back returns home", async () => {
  await renderApp();
  await connect();

  // Connected chip tap opens the dropdown menu instead of acting directly.
  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByTestId("chip-menu")).toBeTruthy();
  fireEvent.press(screen.getByText("Pairing"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });

  // The pairing screen is up, as its own stack entry with a back affordance.
  expect(screen.getByText("Targets")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy();

  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy(); // home again
});

test("an outside tap closes the chip menu without navigating", async () => {
  await renderApp();
  await connect();

  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByTestId("chip-menu")).toBeTruthy();
  fireEvent.press(screen.getByTestId("chip-menu-backdrop"));
  expect(screen.queryByTestId("chip-menu")).toBeNull();
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy(); // still home
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

  // Yes actually disconnects.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("offline")).toBeTruthy();
});

// Regression: pairedSpots is an app-side cache of state that lives on the
// brain and is built fresh each session. A reconnect can land on a rebooted
// (or different) central with no map — the cache must not survive the link.
test("a disconnect clears the paired layout — no phantom builder after reconnect", async () => {
  await renderApp();
  await connect();

  // Pair two targets on the Pairing screen.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Pairing"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
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
  // Home now offers the drill config over the paired layout.
  expect(screen.queryByText(/Pair your targets first/)).toBeNull();
  expect(screen.getByText("Random")).toBeTruthy();

  // Disconnect, then reconnect — the fresh session never paired anything.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  await connect();

  // The stale layout must be gone — otherwise the builder would load a drill
  // onto positions this central never bound.
  expect(screen.getByText(/Pair your targets first/)).toBeTruthy();
  expect(screen.queryByText("Random")).toBeNull();
});

test("the settings button opens the Settings screen — no timeout setting exists", async () => {
  await renderApp();
  await connect();

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
