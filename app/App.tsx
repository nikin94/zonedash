import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MockCentralTransport } from "./src/ble/mock";
import type { ConnectionState } from "./src/ble/transport";

/**
 * ZoneDash operator app. Talks to the central unit through the CentralTransport
 * seam — currently the in-app mock, later the real BLE implementation. This
 * screen owns only the connection; drill/pairing/session screens come next.
 */
export default function App() {
  const transport = useMemo(() => new MockCentralTransport(), []);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "connection") setConnection(e.state);
    });
    return () => {
      unsub();
      transport.disconnect();
    };
  }, [transport]);

  const connected = connection === "connected";
  const busy = connection === "connecting";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ZoneDash</Text>
      <Text style={styles.subtitle}>Court reaction trainer</Text>

      <View style={styles.statusRow}>
        <View style={[styles.dot, connected && styles.dotConnected]} />
        <Text style={styles.status}>
          {connected
            ? "Central unit: connected (mock)"
            : busy
              ? "Central unit: connecting…"
              : "Central unit: not connected"}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => (connected ? transport.disconnect() : transport.connect())}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>
          {connected ? "Disconnect" : "Connect"}
        </Text>
      </Pressable>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    color: "#fafafa",
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 1,
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#71717a",
  },
  dotConnected: {
    backgroundColor: "#34d399",
  },
  status: {
    color: "#71717a",
    fontSize: 13,
  },
  button: {
    marginTop: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  buttonPressed: {
    backgroundColor: "#18181b",
  },
  buttonLabel: {
    color: "#fafafa",
    fontSize: 15,
    fontWeight: "600",
  },
});
