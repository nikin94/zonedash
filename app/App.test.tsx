import { act, fireEvent, render, screen } from "@testing-library/react-native";

import App from "./App";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const renderApp = async () => {
  render(<App />);
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

// The header chip connects while disconnected — the whole app lives on one
// screen, so there is nothing to navigate to.
const connect = async () => {
  fireEvent.press(screen.getByTestId("status-chip"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

// Pairs two targets (spots 0 and 2) on the pairing surface — connect() already
// revealed it. A round opens at the max; place two, then Finish early (with its
// confirm). A completed round waits out the handoff, then the drill controls
// replace the pairing UI under the same court.
const pairTwo = async () => {
  fireEvent.press(screen.getByText("Start pairing"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-0-pulse"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("spot-2-pulse"));
  await act(() => jest.runAllTimersAsync());
  fireEvent.press(screen.getByTestId("finish-pairing"));
  fireEvent.press(screen.getAllByText("Finish")[1]); // the confirm's action
  await act(async () => {
    await jest.runAllTimersAsync(); // finish → done + the 700 ms handoff → drill
  });
};

test("renders the disconnected surface — an idle court and a connect hint", async () => {
  await renderApp();
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("offline")).toBeTruthy(); // header status chip
  expect(screen.getByTestId("settings-button")).toBeTruthy(); // gear always shown
  expect(screen.getByText(/Tap the status in the header to connect/)).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // court is present, idle
});

// Connecting turns the court into the pairing surface — Start pairing over the
// court, no count picker (a round opens at the max and Finish trims it).
test("connecting reveals the pairing surface", async () => {
  await renderApp();
  await connect();
  expect(screen.getByText("mock")).toBeTruthy(); // connected chip label
  expect(screen.queryByTestId("count-pill")).toBeNull();
  expect(screen.getByText("Start pairing")).toBeTruthy();
});

// A completed round doesn't navigate — the same court stays put and the drill
// controls appear under it once the handoff beat elapses.
test("a completed round reveals the drill controls under the court", async () => {
  await renderApp();
  await connect();
  await pairTwo();

  expect(screen.getByText("Random")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();
  expect(screen.getByTestId("repair-button")).toBeTruthy();
  // Pairing UI is gone — the surface swapped in place, no leftover pairing text.
  expect(screen.queryByText("Start pairing")).toBeNull();
});

// The dev shortcut binds every target at once, then runs through the same
// completed-round handoff to the drill controls.
test("the dev complete-pairing shortcut reveals the drill controls", async () => {
  await renderApp();
  await connect();
  fireEvent.press(screen.getByTestId("dev-complete-pairing"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Random")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();
});

// Re-pair is a control under the court; it returns to the pairing surface
// without dropping the link.
test("re-pair from the controls returns to the pairing surface", async () => {
  await renderApp();
  await connect();
  await pairTwo();
  expect(screen.getByText("Random")).toBeTruthy();

  fireEvent.press(screen.getByTestId("repair-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Start pairing")).toBeTruthy(); // pairing surface again
  expect(screen.queryByText("Random")).toBeNull();
});

test("the settings gear opens the settings modal — no timeout setting exists", async () => {
  await renderApp();

  fireEvent.press(screen.getByTestId("settings-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Drill settings")).toBeTruthy();
  expect(screen.getByText("Delay between targets")).toBeTruthy();
  expect(screen.getByText("Same target twice in a row")).toBeTruthy();
  expect(screen.queryByText(/Timeout/)).toBeNull(); // misses don't exist

  // A tap on the scrim outside the card closes it.
  fireEvent.press(screen.getByTestId("settings-backdrop"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.queryByText("Drill settings")).toBeNull();
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

  // Yes actually disconnects and falls back to the disconnected surface.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("offline")).toBeTruthy();
  expect(screen.getByText(/Tap the status in the header to connect/)).toBeTruthy();
});

test("an outside tap closes the chip menu without acting", async () => {
  await renderApp();
  await connect();

  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByTestId("chip-menu")).toBeTruthy();
  fireEvent.press(screen.getByTestId("chip-menu-backdrop"));
  expect(screen.queryByTestId("chip-menu")).toBeNull();
  expect(screen.getByText("Start pairing")).toBeTruthy(); // still the pairing surface
});

// Regression: pairedSpots is an app-side cache of state that lives on the
// brain and is built fresh each session. A reconnect can land on a rebooted
// (or different) central with no map — the cache must not survive the link.
test("a disconnect clears the paired layout — reconnect returns to pairing", async () => {
  await renderApp();
  await connect();
  await pairTwo(); // drill controls, over a real layout
  expect(screen.getByText("Random")).toBeTruthy();

  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Disconnect"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  await connect();

  // Back on the pairing surface with a clean map — no phantom drill controls.
  expect(screen.getByText("Start pairing")).toBeTruthy();
  expect(screen.queryByText("Random")).toBeNull();
  expect(screen.queryAllByTestId(/spot-\d-bound/)).toHaveLength(0);
});
