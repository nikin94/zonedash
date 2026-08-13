import { act, fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MockCentralTransport } from "../../ble/mock";
import { AppStateProvider } from "../../state/AppState";
import { MockAuthProvider } from "../../state/auth.mock";
import { CourtStatusControl } from "./CourtStatusControl";

// The control reads connection + the transport from the store, so it mounts
// inside a real AppStateProvider (with an injected mock transport) — the same
// harness the store's own tests use.
const renderControl = async (transport: MockCentralTransport) => {
  const utils = render(
    <AppStateProvider
      transport={transport}
      auth={new MockAuthProvider()}
      remoteHistory={null}
    >
      <CourtStatusControl />
    </AppStateProvider>,
  );
  await act(async () => {}); // flush the async prefs hydration
  return utils;
};

const flush = () => act(() => jest.runAllTimersAsync());

const openConnected = async (t: MockCentralTransport) => {
  fireEvent.press(screen.getByTestId("court-status"));
  fireEvent.press(screen.getByTestId("status-connect"));
  await flush();
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test("offline: the dot reads disconnected; the modal offers Connect only", async () => {
  const t = new MockCentralTransport();
  await renderControl(t);

  expect(screen.getByTestId("court-status-dot-disconnected")).toBeTruthy();

  // Tap opens a modal (not a dropdown) — Connect is the only action offline.
  fireEvent.press(screen.getByTestId("court-status"));
  expect(screen.getByTestId("court-status-modal")).toBeTruthy();
  expect(screen.getByTestId("status-connect")).toBeTruthy();
  expect(screen.queryByTestId("repair-button")).toBeNull();
  expect(screen.queryByTestId("disconnect-button")).toBeNull();
});

test("Connect from the modal brings the link up — the dot turns connected", async () => {
  const t = new MockCentralTransport();
  await renderControl(t);
  const connect = jest.spyOn(t, "connect");

  await openConnected(t);

  expect(connect).toHaveBeenCalled();
  expect(screen.getByTestId("court-status-dot-connected")).toBeTruthy();
});

test("connected + unpaired: Disconnect acts at once (no confirm), no Re-pair", async () => {
  const t = new MockCentralTransport();
  await renderControl(t);
  await openConnected(t);

  fireEvent.press(screen.getByTestId("court-status"));
  expect(screen.getByTestId("disconnect-button")).toBeTruthy();
  expect(screen.queryByTestId("repair-button")).toBeNull(); // nothing paired yet
  expect(screen.queryByTestId("status-connect")).toBeNull();

  // Disconnect drops the link immediately — no confirm step.
  fireEvent.press(screen.getByTestId("disconnect-button"));
  expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
  await flush();
  expect(screen.getByTestId("court-status-dot-disconnected")).toBeTruthy();
});

test("an outside tap closes the modal without acting", async () => {
  const t = new MockCentralTransport();
  await renderControl(t);

  fireEvent.press(screen.getByTestId("court-status"));
  expect(screen.getByTestId("court-status-modal")).toBeTruthy();
  fireEvent.press(screen.getByTestId("court-status-backdrop"));
  expect(screen.queryByTestId("court-status-modal")).toBeNull();
});
