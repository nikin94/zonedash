import { act, fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import { MockCentralTransport } from "../ble/mock";
import { Button } from "../components/Button";
import { AppStateProvider, useAppStore } from "./AppState";
import { MockAuthProvider } from "./auth.mock";
import { loadPrefs, savePrefs } from "./prefs";

// The migration's whole point: selectors subscribe to ONE slice, so an
// unrelated change no longer re-renders a component. These probes count their
// own renders; a slice change should move only the probe that reads it.
let rotationRenders = 0;
const RotationProbe = () => {
  const rotation = useAppStore((s) => s.courtRotation);
  rotationRenders++;
  return <Text testID="rot">{rotation}</Text>;
};

let connectionRenders = 0;
const ConnectionProbe = () => {
  const connection = useAppStore((s) => s.connection);
  connectionRenders++;
  return <Text testID="conn">{connection}</Text>;
};

const RotateButton = () => {
  const rotate = useAppStore((s) => s.rotateCourt);
  return <Button testID="rotate" label="rotate" onPress={rotate} />;
};

const renderTree = async () => {
  const r = render(
    <AppStateProvider
      transport={new MockCentralTransport()}
      auth={new MockAuthProvider()}
      remoteHistory={null}
    >
      <RotationProbe />
      <ConnectionProbe />
      <RotateButton />
    </AppStateProvider>,
  );
  // Flush the async prefs hydration so its state update lands inside act.
  await act(async () => {});
  return r;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  rotationRenders = 0;
  connectionRenders = 0;
});

test("a selector subscribes to one slice — an unrelated change doesn't re-render the others", async () => {
  await renderTree();

  const connBaseline = connectionRenders;
  const rotBaseline = rotationRenders;

  // Rotate the court: only the courtRotation slice changes.
  await act(async () => {
    fireEvent.press(screen.getByTestId("rotate"));
  });

  // The rotation reader re-rendered and shows the new value…
  expect(rotationRenders).toBeGreaterThan(rotBaseline);
  expect(screen.getByTestId("rot")).toHaveTextContent("1");
  // …but the connection reader, which selects a different slice, did NOT.
  expect(connectionRenders).toBe(connBaseline);
});

// The sticky player name is durable: a stored name hydrates into the store on
// mount, and an edit is written back to prefs — so it survives a restart, like
// the court orientation.
test("the player name hydrates from prefs and an edit persists back", async () => {
  const PlayerProbe = () => {
    const name = useAppStore((s) => s.playerName);
    return <Text testID="player">{name || "-"}</Text>;
  };
  const SetPlayer = () => {
    const set = useAppStore((s) => s.setPlayerName);
    return <Button testID="set" label="set" onPress={() => set("Bob")} />;
  };

  await savePrefs({ playerName: "Alice" });
  render(
    <AppStateProvider
      transport={new MockCentralTransport()}
      auth={new MockAuthProvider()}
      remoteHistory={null}
    >
      <PlayerProbe />
      <SetPlayer />
    </AppStateProvider>,
  );
  // Hydrated from the stored prefs.
  await act(async () => {});
  expect(screen.getByTestId("player")).toHaveTextContent("Alice");

  // An edit persists back to prefs (durable across a restart).
  await act(async () => {
    fireEvent.press(screen.getByTestId("set"));
  });
  expect(screen.getByTestId("player")).toHaveTextContent("Bob");
  await act(async () => {});
  expect((await loadPrefs()).playerName).toBe("Bob");
});

test("selecting a stable seam (transport) never re-renders on a state change", async () => {
  let transportRenders = 0;
  const TransportProbe = () => {
    useAppStore((s) => s.transport);
    transportRenders++;
    return null;
  };
  const RotateOnly = () => {
    const rotate = useAppStore((s) => s.rotateCourt);
    return <Button testID="rotate" label="rotate" onPress={rotate} />;
  };
  render(
    <AppStateProvider
      transport={new MockCentralTransport()}
      auth={new MockAuthProvider()}
      remoteHistory={null}
    >
      <TransportProbe />
      <RotateOnly />
    </AppStateProvider>,
  );
  await act(async () => {});
  const baseline = transportRenders;

  await act(async () => {
    fireEvent.press(screen.getByTestId("rotate"));
  });
  // transport is a stable field set once — reading it is inert to state changes.
  expect(transportRenders).toBe(baseline);
});
