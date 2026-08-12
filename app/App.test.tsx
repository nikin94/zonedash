import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import App from "./App";
import type { SessionSummary } from "./src/domain/session";
import { appendSession } from "./src/state/history";

// Persisted prefs live in one process-wide store, so a test that saves an
// orientation would otherwise leak into the next test's hydration. Clear it
// before each so every test starts from a clean, upright default.
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

const renderApp = async () => {
  const utils = render(<App />);
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  return utils;
};

// The idle surface's Connect hero button brings the link up (the status chip
// moved off the header onto the court).
const connect = async () => {
  fireEvent.press(screen.getByTestId("connect-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

// Pairs two targets (spots 0 and 2) on the pairing surface — connect() already
// revealed it. A round opens at the max; place two, then Finish early (with its
// confirm). A completed round waits out the handoff, then the drill controls
// replace the pairing UI under the same court.
const pairTwo = async () => {
  fireEvent.press(screen.getByTestId("start-pairing"));
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

test("renders the disconnected surface — an idle court and a Connect button", async () => {
  await renderApp();
  // The title header is gone — status lives on the court, so there is no header.
  expect(screen.queryByText("ZoneDash")).toBeNull();
  expect(screen.queryByTestId("status-chip")).toBeNull();
  expect(screen.getByTestId("court-status-dot-disconnected")).toBeTruthy();
  // The footer tab bar is the app's chrome now — three tabs, Drill the default.
  expect(screen.getByTestId("tab-account")).toBeTruthy();
  expect(screen.getByTestId("tab-drill")).toBeTruthy();
  expect(screen.getByTestId("tab-history")).toBeTruthy();
  // The connect action is a hero button under the court, not a header hint.
  expect(screen.getByTestId("connect-button")).toBeTruthy();
  expect(screen.getByText("Connect")).toBeTruthy();
  expect(screen.queryAllByTestId(/spot-\d-off/)).toHaveLength(8); // court is present, idle
});

// The rotate control lives in the court corner on every surface; it turns the
// view a quarter at a time and the orientation persists as the surface changes.
test("the court rotate control turns the view and the orientation persists across surfaces", async () => {
  await renderApp();
  const rotate = () => screen.getByTestId("court-rotate");
  expect(rotate().props.accessibilityState.selected).toBe(false); // starts upright (0°)

  fireEvent.press(rotate());
  expect(rotate().props.accessibilityState.selected).toBe(true); // 90° — rotated

  // Connecting swaps to the pairing surface — the orientation carries over (an
  // app-wide view pref, not tied to the surface or the link).
  await connect();
  expect(screen.getByTestId("start-pairing")).toBeTruthy();
  expect(rotate().props.accessibilityState.selected).toBe(true);

  // Three more quarter turns bring it back to upright (0°) — a 90° step, not a flip.
  fireEvent.press(rotate());
  fireEvent.press(rotate());
  fireEvent.press(rotate());
  expect(rotate().props.accessibilityState.selected).toBe(false);
});

// The orientation is device-local and durable: a quarter turn survives an app
// restart (a full unmount → fresh mount, where storage is the only carry-over).
test("court orientation persists across an app restart", async () => {
  const first = await renderApp();
  fireEvent.press(screen.getByTestId("court-rotate")); // 0° → 90°, persisted
  await act(async () => {
    await jest.runAllTimersAsync(); // let the save effect flush to storage
  });
  expect(
    screen.getByTestId("court-rotate").props.accessibilityState.selected,
  ).toBe(true);

  first.unmount(); // "quit" the app — in-memory state is gone, storage remains
  await renderApp();
  // Rehydrated from storage: the court comes back rotated, not upright.
  expect(
    screen.getByTestId("court-rotate").props.accessibilityState.selected,
  ).toBe(true);
});

// Connecting turns the court into the pairing surface — Start pairing over the
// court, no count picker (a round opens at the max and Finish trims it).
test("connecting reveals the pairing surface", async () => {
  await renderApp();
  await connect();
  expect(screen.getByTestId("court-status-dot-connected")).toBeTruthy();
  expect(screen.queryByTestId("count-pill")).toBeNull();
  expect(screen.getByTestId("start-pairing")).toBeTruthy();
});

// A completed round doesn't navigate — the same court stays put and the drill
// controls appear under it once the handoff beat elapses.
test("a completed round reveals the drill controls under the court", async () => {
  await renderApp();
  await connect();
  await pairTwo();

  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();
  // Re-pair now lives in the court-status modal (not under the court), so it
  // isn't visible until that modal is opened.
  expect(screen.queryByTestId("repair-button")).toBeNull();
  // Pairing UI is gone — the surface swapped in place, no leftover pairing UI.
  expect(screen.queryByTestId("start-pairing")).toBeNull();
});

// The drill-setup page is a full-screen route: the footer tab bar steps aside
// while it's up (its own Done pins the bottom), and returns once Done pops back.
test("the drill-setup page hides the tab bar; Done brings it back", async () => {
  await renderApp();
  await connect();
  await pairTwo();

  // The tab bar is present on the drill surface.
  expect(screen.getByTestId("tab-account")).toBeTruthy();

  // Push the setup page — the tab bar hides.
  fireEvent.press(screen.getByTestId("drill-settings-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("drill-settings-page")).toBeTruthy();
  expect(screen.queryByTestId("tab-account")).toBeNull();
  expect(screen.queryByTestId("tab-history")).toBeNull();

  // Done pops back — the tab bar returns.
  fireEvent.press(screen.getByTestId("drill-settings-done"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.queryByTestId("drill-settings-page")).toBeNull();
  expect(screen.getByTestId("tab-account")).toBeTruthy();
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
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy();
});

// Re-pair lives in the court-status modal (next to Disconnect); behind a
// confirm, it returns to the pairing surface without dropping the link.
test("re-pair from the status modal confirms, then returns to the pairing surface", async () => {
  await renderApp();
  await connect();
  await pairTwo();
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();

  // The menu item only arms the confirm — the layout is still up behind it.
  fireEvent.press(screen.getByTestId("court-status")); // open the status modal
  fireEvent.press(screen.getByTestId("repair-button"));
  expect(screen.getByTestId("repair-confirm")).toBeTruthy();
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy(); // not re-paired yet

  // Keep going backs out with the layout intact.
  fireEvent.press(screen.getByText("Keep going"));
  expect(screen.queryByTestId("repair-confirm")).toBeNull();
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();

  // Confirming Re-pair opens the pairing surface.
  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("repair-button"));
  fireEvent.press(screen.getByText("Re-pair"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("start-pairing")).toBeTruthy(); // pairing surface again
  expect(screen.queryByTestId("drill-settings-button")).toBeNull();
});

// Regression: the pairing→drill handoff must re-arm for EVERY round, not just
// the first. The timer's null-guard once stayed set after round one, so a
// second round (via Re-pair) finished but never revealed the drill controls —
// the operator was stranded on the pairing surface. Reachable by the shipped
// Re-pair gesture, previously uncovered.
test("a second round after Re-pair still hands off to the drill controls", async () => {
  await renderApp();
  await connect();
  await pairTwo(); // first round → drill controls
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();

  // Re-pair (confirmed) back to the pairing surface.
  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("repair-button"));
  fireEvent.press(screen.getByText("Re-pair"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("start-pairing")).toBeTruthy();
  expect(screen.queryByTestId("drill-settings-button")).toBeNull();

  // Second round completes → the handoff fires again → drill controls return.
  await pairTwo();
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();
  expect(screen.getByText("Start")).toBeTruthy(); // drill's Start, not pairing's
  expect(screen.queryByTestId("start-pairing")).toBeNull();
});

// The former Settings tab is now History — the session log lives here (moved off
// Account). Drill settings moved onto the drill setup page (behind the gear), so
// they no longer have a tab of their own.
test("the History tab shows the session log", async () => {
  const logged: SessionSummary = {
    id: "hist-1",
    endedAt: 1_000,
    mode: "random",
    numPositions: 6,
    attempts: 3,
    totalMs: 1200,
    avgMs: 400,
    bestMs: 300,
  };
  await appendSession(logged);

  await renderApp();

  fireEvent.press(screen.getByTestId("tab-history"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  // The logged session shows on the History tab (it moved here off Account).
  expect(screen.getByTestId("history-row-hist-1")).toBeTruthy();
  expect(screen.queryByTestId("history-empty")).toBeNull();
  // Drill settings are no longer a tab — they moved to the drill setup page.
  expect(screen.queryByText("Drill settings")).toBeNull();
});

// The Account tab is the sign-in surface (history moved to its own tab).
// Signed-out by default (no backend configured in tests), sign-in walks the mock
// provider to signed-in, and Sign out returns to the logged-out state.
test("the Account tab signs in and out over the mock provider", async () => {
  await renderApp();

  fireEvent.press(screen.getByTestId("tab-account"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.queryByTestId("history-empty")).toBeNull(); // history moved to its tab
  expect(screen.getByTestId("sign-in-google")).toBeTruthy();

  fireEvent.press(screen.getByTestId("sign-in-google"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("account-name")).toBeTruthy(); // signed in
  expect(screen.getByTestId("sign-out")).toBeTruthy();

  fireEvent.press(screen.getByTestId("sign-out")); // back to the login state
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("sign-in-google")).toBeTruthy();
});

// Navigation must never touch the BLE link: the transport lives above the
// navigator, so a tab round-trip leaves the connection (and the paired layout)
// exactly as they were.
test("switching tabs keeps the BLE link and drill surface intact", async () => {
  await renderApp();
  await connect();
  await pairTwo();
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy(); // on the drill controls

  // Leave to Account and back to Drill.
  fireEvent.press(screen.getByTestId("tab-account"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  fireEvent.press(screen.getByTestId("tab-drill"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  // Link held and the drill surface is right where it was — no reconnect, no
  // reset to pairing (the status dot on the court still reads connected).
  expect(screen.getByTestId("court-status-dot-connected")).toBeTruthy();
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();
  expect(screen.queryByTestId("start-pairing")).toBeNull();
});

test("Disconnect lives in the status modal behind the confirm — No keeps the link", async () => {
  await renderApp();
  await connect();

  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("disconnect-button"));
  expect(screen.getByText("Disconnect from the central unit?")).toBeTruthy();

  fireEvent.press(screen.getByText("No"));
  expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
  expect(screen.getByTestId("start-pairing")).toBeTruthy(); // still connected

  // Yes actually disconnects and falls back to the disconnected surface.
  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("disconnect-button"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("court-status-dot-disconnected")).toBeTruthy();
  expect(screen.getByTestId("connect-button")).toBeTruthy();
});

test("an outside tap closes the status modal without acting", async () => {
  await renderApp();
  await connect();

  fireEvent.press(screen.getByTestId("court-status"));
  expect(screen.getByTestId("court-status-modal")).toBeTruthy();
  fireEvent.press(screen.getByTestId("court-status-backdrop"));
  expect(screen.queryByTestId("court-status-modal")).toBeNull();
  expect(screen.getByTestId("start-pairing")).toBeTruthy(); // still the pairing surface
});

// Regression: pairedSpots is an app-side cache of state that lives on the
// brain and is built fresh each session. A reconnect can land on a rebooted
// (or different) central with no map — the cache must not survive the link.
test("a disconnect clears the paired layout — reconnect returns to pairing", async () => {
  await renderApp();
  await connect();
  await pairTwo(); // drill controls, over a real layout
  expect(screen.getByTestId("drill-settings-button")).toBeTruthy();

  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("disconnect-button"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  await connect();

  // Back on the pairing surface with a clean map — no phantom drill controls.
  expect(screen.getByTestId("start-pairing")).toBeTruthy();
  expect(screen.queryByTestId("drill-settings-button")).toBeNull();
  expect(screen.queryAllByTestId(/spot-\d-bound/)).toHaveLength(0);
});
