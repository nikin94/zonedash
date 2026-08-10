import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import { MockCentralTransport } from "../ble/mock";
import type { SessionSummary } from "../domain/session";
import { AppStateProvider, useAppState } from "./AppState";
import { MockAuthProvider } from "./auth.mock";
import { appendSession, loadHistory } from "./history";
import type { RemoteHistoryStore } from "./sync";
import { Button } from "../components/Button";

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

// A consumer that surfaces auth status and drives sign-in/out.
const Probe = () => {
  const { authStatus, authUser, signIn, signOut } = useAppState();
  return (
    <>
      <Text testID="status">{authStatus}</Text>
      <Text testID="who">{authUser?.name ?? "-"}</Text>
      <Button testID="in" label="in" onPress={signIn} />
      <Button testID="out" label="out" onPress={signOut} />
    </>
  );
};

const renderApp = async (auth: MockAuthProvider, remote?: RemoteHistoryStore) => {
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

test("on sign-in the local history is reconciled with the cloud archive", async () => {
  // This device has session 3; the account already has 2 from another device.
  await appendSession(sess(3));
  const remote = new FakeRemote().seed([sess(2)]);

  await renderApp(new MockAuthProvider(), remote);
  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });

  // The device's 3 was pushed up, and the cloud's 2 merged into local history.
  await waitFor(async () => {
    expect([...remote.rows.keys()].sort()).toEqual(["2", "3"]);
    expect((await loadHistory()).map((s) => s.id)).toEqual(["3", "2"]);
  });
});

test("without a backend, sign-in does not touch history (local-only)", async () => {
  await appendSession(sess(1));
  await renderApp(new MockAuthProvider()); // remoteHistory null

  await act(async () => {
    fireEvent.press(screen.getByTestId("in"));
  });

  expect((await loadHistory()).map((s) => s.id)).toEqual(["1"]); // unchanged
});
