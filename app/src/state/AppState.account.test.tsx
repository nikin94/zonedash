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

import { AppStateProvider, useAppStore } from "./AppState";
import { MockAuthProvider } from "./auth.mock";
import { appendSession, loadHistory } from "./history";
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

// A consumer that surfaces auth status/error and drives sign-in/out. The
// "record" button files a fresh finished session (id 9) through recordSession.
const Probe = () => {
  const { authStatus, authUser, authError, signIn, signOut, recordSession } =
    useAppStore(
      useShallow((s) => ({
        authStatus: s.authStatus,
        authUser: s.authUser,
        authError: s.authError,
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
      <Button testID="in" label="in" onPress={signIn} />
      <Button testID="out" label="out" onPress={signOut} />
      <Button
        testID="record"
        label="rec"
        onPress={() => recordSession(sess(9))}
      />
    </>
  );
};

const renderApp = async (
  auth: MockAuthProvider,
  remote?: RemoteHistoryStore,
) => {
  const r = render(
    <AppStateProvider
      transport={new MockCentralTransport()}
      auth={auth}
      remoteHistory={remote ?? null}
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
