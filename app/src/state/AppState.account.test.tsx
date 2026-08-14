import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import { MockCentralTransport } from "../ble/mock";
import type { SessionSummary } from "../domain/session";
import { useShallow } from "zustand/react/shallow";

import {
  AppStateProvider,
  DEFAULT_SETTINGS,
  type DrillSettings,
  useAppStore,
} from "./AppState";
import { MockAuthProvider } from "./auth.mock";
import { appendSession, loadHistory } from "./history";
import { loadPrefs } from "./prefs";
import type { RemoteSettingsStore } from "./settings";
import type { RemoteHistoryStore } from "./sync";
import { Button } from "../components/Button";
import { HistoryPanel } from "../components/HistoryPanel";

const sess = (endedAt: number): SessionSummary => ({
  id: String(endedAt),
  endedAt,
  mode: "random",
  numPositions: 6,
  attempts: 3,
  totalMs: 1200,
  avgMs: 400,
  bestMs: 300,
});

// The id MockAuthProvider signs in as (auth.mock DEFAULT_USER) — the key the
// account's history bucket is scoped by, kept separate from the anonymous log.
const MOCK_USER_ID = "mock-user";

class FakeRemote implements RemoteHistoryStore {
  rows = new Map<string, SessionSummary>();
  seed(s: SessionSummary[]): this {
    for (const x of s) this.rows.set(x.id, x);
    return this;
  }
  async list(): Promise<SessionSummary[]> {
    return [...this.rows.values()];
  }
  async upsert(_u: string, s: SessionSummary[]): Promise<void> {
    for (const x of s) if (!this.rows.has(x.id)) this.rows.set(x.id, x);
  }
}

class FakeRemoteSettings implements RemoteSettingsStore {
  row: DrillSettings | null = null;
  saves: DrillSettings[] = [];
  seed(s: DrillSettings): this {
    this.row = s;
    return this;
  }
  async load(): Promise<DrillSettings | null> {
    return this.row;
  }
  async save(_userId: string, s: DrillSettings): Promise<void> {
    this.saves.push(s);
    this.row = s;
  }
}

// A consumer that surfaces auth status/error and drives sign-in/out. The
// "record" button files a fresh finished session (id 9) through recordSession.
const Probe = () => {
  const {
    authStatus,
    authUser,
    authError,
    lastSessionMode,
    settings,
    setSettings,
    signIn,
    signOut,
    recordSession,
  } = useAppStore(
    useShallow((s) => ({
      authStatus: s.authStatus,
      authUser: s.authUser,
      authError: s.authError,
      lastSessionMode: s.lastSessionMode,
      settings: s.settings,
      setSettings: s.setSettings,
      signIn: s.signIn,
      signOut: s.signOut,
      recordSession: s.recordSession,
    })),
  );
  return (
    <>
      <Text testID="status">{authStatus}</Text>
      <Text testID="who">{authUser?.name ?? "-"}</Text>
      <Text testID="error">{authError ?? "-"}</Text>
      <Text testID="last-mode">{lastSessionMode ?? "-"}</Text>
      <Text testID="delay">{settings.delayMs}</Text>
      <Button testID="in" label="in" onPress={signIn} />
      <Button testID="out" label="out" onPress={signOut} />
      <Button
        testID="set-delay"
        label="set-delay"
        onPress={() => setSettings({ ...settings, delayMs: 1500 })}
      />
      <Button
        testID="record"
        label="rec"
        onPress={() => recordSession(sess(9))}
      />
      <Button
        testID="record-path"
        label="rec-path"
        onPress={() => recordSession({ ...sess(9), mode: "path" })}
      />
    </>
  );
};

const renderApp = async (
  auth: MockAuthProvider,
  remote?: RemoteHistoryStore,
  remoteSettings?: RemoteSettingsStore,
) => {
  const r = render(
    <AppStateProvider
      transport={new MockCentralTransport()}
      auth={auth}
      remoteHistory={remote ?? null}
      remoteSettings={remoteSettings ?? null}
    >
      <Probe />
    </AppStateProvider>,
  );
  // Flush the async prefs hydration so its state update doesn't land outside act.
  await act(async () => {});
  return r;
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("starts signed-out — the app default, no backend needed", async () => {
  await renderApp(new MockAuthProvider());
  expect(screen.getByTestId("status")).toHaveTextContent("signed-out");
});

test("sign-in flips status to signed-in and back out on sign-out", async () => {
  await renderApp(new MockAuthProvider());

  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });
  expect(screen.getByTestId("status")).toHaveTextContent("signed-in");
  expect(screen.getByTestId("who")).toHaveTextContent("Tester");

  await act(async () => {
    fireEvent.press(screen.getByTestId("out"));
  });
  expect(screen.getByTestId("status")).toHaveTextContent("signed-out");
});

// Separate histories: signing in shows the ACCOUNT's own history (its cloud
// archive), never the device's anonymous runs — and the anonymous log is left
// untouched, NOT migrated up into the account.
test("sign-in loads the account's cloud history and keeps the anonymous log separate", async () => {
  await appendSession(sess(3)); // an anonymous run recorded on this device
  const remote = new FakeRemote().seed([sess(2)]); // the account's cloud archive

  await renderApp(new MockAuthProvider(), remote);
  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });

  await waitFor(async () => {
    // The account's local bucket now mirrors its cloud (2) — NOT the anon run (3).
    expect((await loadHistory(MOCK_USER_ID)).map((s) => s.id)).toEqual(["2"]);
  });
  // The anonymous run stayed in the anonymous bucket, untouched…
  expect((await loadHistory()).map((s) => s.id)).toEqual(["3"]);
  // …and was never pushed up into the account's cloud.
  expect([...remote.rows.keys()].sort()).toEqual(["2"]);
});

test("a sign-in sync surfaces the synced session with no tab round-trip", async () => {
  // The account already has session 2 (another device); this device's log is
  // empty. This mirrors AccountScreen's wiring: historyVersion feeds the history
  // list's refreshKey, with NO focus/navigation event driving a re-read.
  const remote = new FakeRemote().seed([sess(2)]);
  const SyncedHistory = () => {
    const { signIn, historyVersion, userId } = useAppStore(
      useShallow((s) => ({
        signIn: s.signIn,
        historyVersion: s.historyVersion,
        userId: s.authUser?.id ?? null,
      })),
    );
    return (
      <>
        <Button testID="in" label="in" onPress={signIn} />
        <HistoryPanel refreshKey={historyVersion} userId={userId} />
      </>
    );
  };

  render(
    <AppStateProvider
      transport={new MockCentralTransport()}
      auth={new MockAuthProvider()}
      remoteHistory={remote}
    >
      <SyncedHistory />
    </AppStateProvider>,
  );
  await act(async () => {}); // flush prefs hydration
  expect(screen.queryByTestId("history-row-2")).toBeNull(); // nothing before sign-in

  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });

  // The synced session appears on its own — historyVersion bumped on sync
  // completion, so the list re-read without leaving and returning to the tab.
  await waitFor(() => expect(screen.getByTestId("history-row-2")).toBeTruthy());
});

test("a failed sign-in surfaces authError, cleared on a later success", async () => {
  const auth = new MockAuthProvider({ failSignIn: true });
  await renderApp(auth);

  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });
  expect(screen.getByTestId("status")).toHaveTextContent("signed-out");
  expect(screen.getByTestId("error")).toHaveTextContent(/cancelled/);

  // Recover: a subsequent successful sign-in clears the stale error.
  auth.failSignIn = false;
  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });
  expect(screen.getByTestId("status")).toHaveTextContent("signed-in");
  expect(screen.getByTestId("error")).toHaveTextContent("-");
});

test("without a backend, sign-in does not touch history (local-only)", async () => {
  await appendSession(sess(1));
  await renderApp(new MockAuthProvider()); // remoteHistory null

  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });

  expect((await loadHistory()).map((s) => s.id)).toEqual(["1"]); // unchanged
});

// Per-session cloud push: a run finished WHILE signed in reaches the account's
// archive right away (not only at the next sign-in reconcile). recordSession
// pushes that one session up, best-effort, off the critical path.
test("recording a session while signed in pushes it to the cloud at once", async () => {
  const remote = new FakeRemote();
  const auth = new MockAuthProvider();
  await renderApp(auth, remote);

  await act(async () => {
    fireEvent.press(screen.getByTestId("in")); // sign in first
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("record")); // a run finishes now
  });

  // The session is in the cloud archive without any sign-out/in round trip…
  await waitFor(() => expect(remote.rows.has("9")).toBe(true));
  // …and in the ACCOUNT's device-local bucket (recordSession writes local first,
  // scoped to the signed-in identity)…
  await waitFor(async () =>
    expect((await loadHistory(MOCK_USER_ID)).map((s) => s.id)).toEqual(["9"]),
  );
  // …never in the anonymous log — a signed-in run is the account's, not the
  // device's anonymous history.
  expect(await loadHistory()).toEqual([]);
});

// Signed-out stays purely local — recordSession writes the device log and never
// reaches for the cloud (there is no account to push to).
test("recording a session while signed out stays local — no cloud push", async () => {
  const remote = new FakeRemote();
  await renderApp(new MockAuthProvider(), remote); // signed-out by default

  await act(async () => {
    fireEvent.press(screen.getByTestId("record"));
  });

  await waitFor(async () =>
    expect((await loadHistory()).map((s) => s.id)).toEqual(["9"]),
  );
  expect(remote.rows.has("9")).toBe(false); // nothing pushed to the cloud
});

// recordSession remembers the run's mode so the History screen opens on its tab
// — otherwise a Path/Live run hides behind the default Random tab.
test("recording a session remembers its mode for the History tab", async () => {
  await renderApp(new MockAuthProvider());
  expect(screen.getByTestId("last-mode")).toHaveTextContent("-"); // none yet

  await act(async () => {
    fireEvent.press(screen.getByTestId("record-path"));
  });
  expect(screen.getByTestId("last-mode")).toHaveTextContent("path");
});

// ── Cloud settings sync (signed-in) ──────────────────────────────────────────

// Sign-in adopts the account's saved settings — the coach's changed values
// follow the account, so a fresh install / new device no longer resets to the
// defaults.
test("sign-in adopts the account's saved drill settings", async () => {
  const remoteSettings = new FakeRemoteSettings().seed({
    ...DEFAULT_SETTINGS,
    delayMs: 1500,
    allowImmediateRepeat: true,
  });
  await renderApp(new MockAuthProvider(), undefined, remoteSettings);
  expect(screen.getByTestId("delay")).toHaveTextContent("0"); // defaults before sign-in

  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });
  await waitFor(() =>
    expect(screen.getByTestId("delay")).toHaveTextContent("1500"),
  );
});

// A fresh account (no row yet) is SEEDED from the device's current settings on
// sign-in — not reset to the defaults — so signing in never wipes a tweak.
test("first sign-in seeds the cloud from the device's current settings", async () => {
  const remoteSettings = new FakeRemoteSettings(); // empty — no row
  await renderApp(new MockAuthProvider(), undefined, remoteSettings);

  // Tweak while signed-out (local-only), then sign in with an empty account.
  await act(async () => {
    fireEvent.press(screen.getByTestId("set-delay"));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });

  await waitFor(() =>
    expect(remoteSettings.row).toEqual({ ...DEFAULT_SETTINGS, delayMs: 1500 }),
  );
  expect(screen.getByTestId("delay")).toHaveTextContent("1500"); // kept, not reset
});

// A settings edit WHILE signed in pushes to the account's cloud row right away
// (best-effort), so it survives a reload and follows the account.
test("editing settings while signed in pushes them to the cloud", async () => {
  const remoteSettings = new FakeRemoteSettings().seed({ ...DEFAULT_SETTINGS });
  await renderApp(new MockAuthProvider(), undefined, remoteSettings);
  await act(async () => {
    fireEvent.press(screen.getByTestId("in")); // sign in first (load runs)
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId("set-delay")); // change the delay
  });
  await waitFor(() =>
    expect(remoteSettings.saves.at(-1)).toEqual({
      ...DEFAULT_SETTINGS,
      delayMs: 1500,
    }),
  );
});

// Signed-out, a settings change never reaches the cloud — there is no account to
// push to; it stays purely local (the prefs blob).
test("editing settings while signed out never touches the cloud", async () => {
  const remoteSettings = new FakeRemoteSettings();
  await renderApp(new MockAuthProvider(), undefined, remoteSettings); // signed-out

  await act(async () => {
    fireEvent.press(screen.getByTestId("set-delay"));
  });
  expect(remoteSettings.saves).toEqual([]); // nothing pushed
  expect(remoteSettings.row).toBeNull();
});

// ── Per-identity settings isolation (the leak history is careful to avoid) ────

// An account's settings live in the CLOUD, not on the shared device: signing in
// adopts them, but sign-out restores the device's OWN anonymous settings, and
// the account's values never overwrite the anonymous prefs blob. So account A
// tweaking settings on a club device never changes what the next anonymous user
// (or a fresh sign-in) sees — the same per-identity isolation history has.
test("an account's settings never persist onto the device — sign-out restores the anonymous ones", async () => {
  const remoteSettings = new FakeRemoteSettings().seed({
    ...DEFAULT_SETTINGS,
    delayMs: 300, // the account's own delay
  });
  await renderApp(new MockAuthProvider(), undefined, remoteSettings);

  // The device's anonymous user sets their own delay (1500).
  await act(async () => {
    fireEvent.press(screen.getByTestId("set-delay"));
  });
  expect(screen.getByTestId("delay")).toHaveTextContent("1500");

  // Sign in → the account's settings (300) are adopted…
  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });
  await waitFor(() =>
    expect(screen.getByTestId("delay")).toHaveTextContent("300"),
  );
  // …but the anonymous prefs blob is untouched — it still holds 1500, not 300.
  await waitFor(async () =>
    expect((await loadPrefs()).settings?.delayMs).toBe(1500),
  );

  // Sign out → the device's anonymous settings (1500) come back, NOT the
  // account's 300. No cross-identity leak onto the shared device.
  await act(async () => {
    fireEvent.press(screen.getByTestId("out"));
  });
  expect(screen.getByTestId("delay")).toHaveTextContent("1500");
  expect((await loadPrefs()).settings?.delayMs).toBe(1500);
});

// A settings edit made WHILE signed in follows the account (cloud) but never
// rewrites the device's anonymous prefs, so it can't survive a sign-out onto the
// shared device.
test("a signed-in edit follows the account, not the device's anonymous prefs", async () => {
  const remoteSettings = new FakeRemoteSettings().seed({ ...DEFAULT_SETTINGS });
  await renderApp(new MockAuthProvider(), undefined, remoteSettings);
  await act(async () => {
    fireEvent.press(screen.getByTestId("in")); // sign in (anonymous delay is 0)
  });

  // Edit while signed in → the cloud row gets it…
  await act(async () => {
    fireEvent.press(screen.getByTestId("set-delay"));
  });
  await waitFor(() =>
    expect(remoteSettings.saves.at(-1)).toEqual({
      ...DEFAULT_SETTINGS,
      delayMs: 1500,
    }),
  );
  // …but the device's anonymous prefs stay at the default (0), untouched.
  expect((await loadPrefs()).settings?.delayMs).toBe(0);

  // Sign out → the device returns to its anonymous default, not the edit.
  await act(async () => {
    fireEvent.press(screen.getByTestId("out"));
  });
  expect(screen.getByTestId("delay")).toHaveTextContent("0");
});
