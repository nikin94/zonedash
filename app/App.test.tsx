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
// landed there. A completed round hands straight over to the Drill screen.
const pairTwo = async () => {
  fireEvent.press(screen.getByTestId("count-pill"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 2, label: "2" } }));
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-0-available"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-2-available"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

test("renders the empty home with the disconnected state", async () => {
  await renderApp();
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("offline")).toBeTruthy(); // header status chip
  // Home carries no content yet — just the header and its settings button.
  expect(screen.getByTestId("settings-button")).toBeTruthy();
});

// An unpaired session has nothing to do at home, so connecting lands straight
// on the Pairing screen.
test("connecting goes straight to the Pairing screen", async () => {
  await renderApp();
  await connect();
  expect(screen.getByText("mock")).toBeTruthy(); // brief connected label
  expect(screen.getByText("Targets")).toBeTruthy();
  expect(screen.getByText("Start pairing")).toBeTruthy();
});

// Before a layout exists there is nowhere to go back TO — home redirects
// straight back to Pairing — so the back button must not exist there. Once the
// round completes the app hands over to the Drill screen instead.
test("Pairing has no back button and a finished round hands over to Drill", async () => {
  await renderApp();
  await connect();
  expect(screen.queryByTestId("header-back")).toBeNull();

  await pairTwo();
  // Landed on the Drill screen — the config + run, over the paired layout.
  expect(screen.getByText("Drill")).toBeTruthy(); // header title
  expect(screen.getByText("Random")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();
});

test("Drill backs out to the empty home; the chip menu reaches both screens", async () => {
  await renderApp();
  await connect();
  await pairTwo();

  // Back off the Drill screen → the empty home (header only, settings button).
  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.queryByText("Random")).toBeNull(); // no content at home yet
  expect(screen.getByTestId("settings-button")).toBeTruthy();

  // With a layout the chip menu offers both Drill and Pairing.
  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByTestId("chip-menu")).toBeTruthy();
  fireEvent.press(screen.getByText("Drill"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Random")).toBeTruthy(); // back on the Drill screen
});

test("re-pairing from the chip menu returns to Drill, layout kept", async () => {
  await renderApp();
  await connect();
  await pairTwo(); // on Drill

  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Pairing"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  // A layout already exists, so the way back is available.
  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.getByTestId("header-back")).toBeTruthy();

  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Random")).toBeTruthy(); // back on Drill, layout kept
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
});

// Regression: pairedSpots is an app-side cache of state that lives on the
// brain and is built fresh each session. A reconnect can land on a rebooted
// (or different) central with no map — the cache must not survive the link.
test("a disconnect clears the paired layout — reconnect starts at Pairing again", async () => {
  await renderApp();
  await connect();
  await pairTwo(); // on Drill, over a real layout
  expect(screen.getByText("Random")).toBeTruthy();

  // Disconnect, then reconnect — the fresh session never paired anything.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  await connect();

  // The stale layout must be gone — no phantom Drill config; the app is back
  // on the Pairing screen with a clean map.
  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryByText("Random")).toBeNull();
  expect(screen.queryAllByTestId(/spot-\d-bound/)).toHaveLength(0);
});

test("the settings button opens the Settings screen — no timeout setting exists", async () => {
  await renderApp();
  await connect();
  await pairTwo();

  // Settings lives behind the gear on the home header — back off Drill first.
  fireEvent.press(screen.getByTestId("header-back"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  fireEvent.press(screen.getByTestId("settings-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Drill settings")).toBeTruthy();
  expect(screen.getByText("Delay between targets")).toBeTruthy();
  expect(screen.getByText("Same target twice in a row")).toBeTruthy();
  expect(screen.queryByText(/Timeout/)).toBeNull(); // misses don't exist
});
