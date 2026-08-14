import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import App from "./App";
import type { SessionSummary } from "./src/domain/session";
import { COURT_ACTION_GAP, COURT_STRIP_H } from "./src/helpers/court";
import { tabBarClearance } from "./src/navigation/GlassTabBar";
import { appendSession } from "./src/state/history";
import { loadPrefs, savePrefs } from "./src/state/prefs";

// Persisted prefs live in one process-wide store, so a test that saves an
// orientation would otherwise leak into the next test's hydration. Clear it
// before each so every test starts from a clean, upright default.
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

// Almost every test wants the app itself, not the first-run login gate. Seed
// the durable "gate passed" flag (merged, so a test's saved court orientation
// survives) so <App/> boots straight into the tab shell. The gate's own tests
// use renderFresh (no seed) below.
const renderApp = async () => {
  const prev = await loadPrefs();
  await savePrefs({ ...prev, authGatePassed: true });
  const utils = render(<App />);
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  return utils;
};

// A cold first launch — no stored choice, so the login gate is up.
const renderFresh = async () => {
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

// The idle Connect button sits the shared COURT_ACTION_GAP below the court —
// the same value the drill/pairing surfaces use — instead of a raw (column gap
// + court bottom strip) that reads too large. The column gap plus the court's
// reserved bottom strip plus the button's pull-up margin must net to that one
// shared value.
test("the court→Connect gap resolves to the shared court-action gap", async () => {
  await renderApp();
  const idle = StyleSheet.flatten(
    screen.getByTestId("idle-surface").props.style,
  );
  const connect = StyleSheet.flatten(
    within(screen.getByTestId("idle-surface")).getByTestId("connect-button")
      .props.style,
  );
  expect(idle.gap + COURT_STRIP_H + connect.marginTop).toBe(COURT_ACTION_GAP);
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

// The drill-setup page opens as a window-level modal (react-native-screens),
// so it covers the floating tab bar NATIVELY instead of the app unmounting the
// bar. The bar therefore stays mounted the whole time — nothing resizes on open
// or close, which is what removes the Done-button jump. (The visual "covers the
// bar" is a native modal concern jest can't observe; what it CAN lock is that
// the bar is never torn out of the tree.)
test("the drill-setup page opens over the app without unmounting the tab bar", async () => {
  await renderApp();
  await connect();
  await pairTwo();

  expect(screen.getByTestId("tab-account")).toBeTruthy();

  // Open the setup page — it mounts, and the bar stays put (no hide/resize).
  fireEvent.press(screen.getByTestId("drill-settings-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("drill-settings-page")).toBeTruthy();
  expect(screen.getByTestId("tab-account")).toBeTruthy();
  expect(screen.getByTestId("tab-history")).toBeTruthy();

  // Done pops it — the page unmounts, the bar was never touched.
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

// Clearing the log now lives in the ⋮ overflow menu beside the title (not a
// button under the list): open the menu, Clear → confirm → the log empties and
// the menu affordance disappears (nothing left to clear).
test("the History overflow menu clears the log behind a confirm", async () => {
  await appendSession({
    id: "h1",
    endedAt: 1_000,
    mode: "random",
    numPositions: 6,
    attempts: 3,
    totalMs: 1200,
    avgMs: 400,
    bestMs: 300,
  });
  await renderApp();

  fireEvent.press(screen.getByTestId("tab-history"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  // The kebab shows only with sessions to act on; there is no Clear button below.
  expect(screen.getByTestId("history-menu-button")).toBeTruthy();
  expect(screen.queryByText("Clear history")).toBeNull(); // hidden in the menu

  // Open the menu → Clear arms the confirm; nothing is wiped yet.
  fireEvent.press(screen.getByTestId("history-menu-button"));
  fireEvent.press(screen.getByTestId("clear-history-button"));
  expect(screen.getByTestId("clear-history-confirm")).toBeTruthy();
  expect(screen.getByTestId("history-row-h1")).toBeTruthy();

  // Confirm → the log empties and the kebab is gone (nothing to clear).
  fireEvent.press(screen.getByText("Clear"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("history-empty")).toBeTruthy();
  expect(screen.queryByTestId("history-menu-button")).toBeNull();
});

// The History mode tabs filter the log by drill mode: the default (first) tab
// shows its own mode's runs, and switching tabs swaps the list. An empty tab
// shows the "no sessions" hint while the log (other modes) is untouched.
test("the History mode tabs filter the log by drill mode", async () => {
  const sess = (id: string, mode: string): SessionSummary => ({
    id,
    endedAt: Number(id),
    mode,
    numPositions: 6,
    attempts: 3,
    totalMs: 1200,
    avgMs: 400,
    bestMs: 300,
  });
  await appendSession(sess("10", "random"));
  await appendSession(sess("20", "path"));

  await renderApp();
  fireEvent.press(screen.getByTestId("tab-history"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });

  // Default tab is Random — the random run shows, the path run does not.
  expect(screen.getByTestId("history-row-10")).toBeTruthy();
  expect(screen.queryByTestId("history-row-20")).toBeNull();

  // Switch to the Path tab → the path run shows, the random one drops.
  fireEvent.press(screen.getByTestId("segment-path"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("history-row-20")).toBeTruthy();
  expect(screen.queryByTestId("history-row-10")).toBeNull();

  // The Live tab has no runs → the empty hint, but the log still has sessions so
  // the Clear affordance (kebab) stays available.
  fireEvent.press(screen.getByTestId("segment-live"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("history-empty")).toBeTruthy();
  expect(screen.getByTestId("history-menu-button")).toBeTruthy();
});

// Regression: a finished run must be visible on the History tab without manually
// switching modes. The mode tabs default to Random, so a Path/Live run used to
// land behind a hidden tab and look "missing" — recordSession now remembers the
// run's mode and the History tab opens on it.
test("a finished Path run is visible on the History tab, not hidden behind Random", async () => {
  await renderApp();
  await connect();
  await pairTwo(); // drill controls over a real 2-spot layout

  // Author a one-step Path drill: pick Path in the setup, tap a paired spot.
  fireEvent.press(screen.getByTestId("drill-settings-button"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  fireEvent.press(screen.getByText("Path"));
  fireEvent.press(screen.getByTestId("drill-settings-done"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  fireEvent.press(screen.getAllByTestId(/spot-\d-available/)[0]);

  // Run it to completion, then dismiss the results popup.
  fireEvent.press(screen.getByText("Start"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  fireEvent.press(screen.getByTestId("session-result-done"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });

  // Open History → it opens on the Path tab (the run's mode), so the run shows
  // straight away instead of the empty Random tab.
  fireEvent.press(screen.getByTestId("tab-history"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(
    screen.getByTestId("segment-path").props.accessibilityState.selected,
  ).toBe(true);
  expect(screen.getByTestId("history-list")).toBeTruthy();
  expect(screen.queryByTestId("history-empty")).toBeNull();
});

// The Account tab is the sign-in surface (history moved to its own tab).
// Signed-out by default (no backend configured in tests), sign-in walks the mock
// provider to signed-in, and Sign out returns to the logged-out state.
test("the Account tab signs in, and a sign-out returns to the login gate", async () => {
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

  // Signing out of the account drops back to the login gate (not just the
  // Account tab's signed-out view) — the gate reopens on an explicit logout.
  fireEvent.press(screen.getByTestId("sign-out"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("login-screen")).toBeTruthy();
  expect(screen.queryByTestId("tab-account")).toBeNull(); // the app shell is gone
});

// The Account list clears the floating tab bar with the SHARED clearance (bar
// row + safe-area gap), not a hand-tuned magic constant — so a bar-geometry
// change flows through one source instead of drifting per screen. In tests the
// bottom inset is 0, so the pad is exactly tabBarClearance(0).
test("the Account list clears the tab bar via the shared clearance, not a magic pad", async () => {
  await renderApp();
  fireEvent.press(screen.getByTestId("tab-account"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });

  const content = StyleSheet.flatten(
    screen.getByTestId("account-scroll").props.contentContainerStyle,
  );
  expect(content.paddingBottom).toBe(tabBarClearance(0));
  expect(content.paddingBottom).not.toBe(120); // not the old magic constant
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

test("Disconnect in the status modal drops the link at once — no confirm", async () => {
  await renderApp();
  await connect();

  // Disconnect acts immediately: no confirm dialog, straight to the
  // disconnected surface.
  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("disconnect-button"));
  expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
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
  fireEvent.press(screen.getByTestId("disconnect-button")); // acts at once, no confirm
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  await connect();

  // Back on the pairing surface with a clean map — no phantom drill controls.
  expect(screen.getByTestId("start-pairing")).toBeTruthy();
  expect(screen.queryByTestId("drill-settings-button")).toBeNull();
  expect(screen.queryAllByTestId(/spot-\d-bound/)).toHaveLength(0);
});

// ── First-run login gate ─────────────────────────────────────────────────────

// A cold launch (no stored choice) shows the login gate over the app: a Google
// sign-in and a "continue offline" skip — and the app shell (its tabs) is not
// mounted until the gate is passed.
test("a cold launch shows the login gate, not the app", async () => {
  await renderFresh();
  expect(screen.getByTestId("login-screen")).toBeTruthy();
  expect(screen.getByTestId("login-google")).toBeTruthy();
  expect(screen.getByTestId("login-skip")).toBeTruthy();
  // The app shell (tab bar / court) is behind the gate — not mounted yet.
  expect(screen.queryByTestId("tab-drill")).toBeNull();
  expect(screen.queryByTestId("connect-button")).toBeNull();
});

// "Continue offline" dismisses the gate into the local-only app, and the choice
// is durable — a relaunch boots straight past the gate.
test("continue-without-auth enters the app and is remembered across a relaunch", async () => {
  const first = await renderFresh();
  fireEvent.press(screen.getByTestId("login-skip"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  // Gate gone, app up (the disconnected Drill surface).
  expect(screen.queryByTestId("login-screen")).toBeNull();
  expect(screen.getByTestId("connect-button")).toBeTruthy();
  expect(screen.getByTestId("tab-drill")).toBeTruthy();

  // Relaunch (fresh mount, prefs persisted) — no gate this time.
  first.unmount();
  await renderFresh();
  expect(screen.queryByTestId("login-screen")).toBeNull();
  expect(screen.getByTestId("connect-button")).toBeTruthy();
});

// Signing in from the gate enters the app too, and latches the durable flag, so
// a relaunch (with no sign-out) skips the gate. Only an explicit sign-out
// reopens it — covered separately by the Account sign-out test.
test("sign-in from the gate enters the app and is remembered across a relaunch", async () => {
  const first = await renderFresh();
  fireEvent.press(screen.getByTestId("login-google"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.queryByTestId("login-screen")).toBeNull();
  expect(screen.getByTestId("connect-button")).toBeTruthy();

  // Relaunch — the gate stays gone.
  first.unmount();
  await renderFresh();
  expect(screen.queryByTestId("login-screen")).toBeNull();
  expect(screen.getByTestId("connect-button")).toBeTruthy();
});
