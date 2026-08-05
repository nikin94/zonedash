import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MockCentralTransport } from "./src/ble/mock";
import type { ConnectionState } from "./src/ble/transport";
import { DrillPanel } from "./src/screens/DrillPanel";
import { PairingPanel } from "./src/screens/PairingPanel";
import {
  DEFAULT_SETTINGS,
  SettingsPanel,
  type DrillSettings,
} from "./src/screens/SettingsPanel";

/**
 * ZoneDash operator app. Talks to the central unit through the CentralTransport
 * seam — currently the in-app mock, later the real BLE implementation. This
 * screen owns the header (title + settings), the connection, the Pair/Drill
 * section switch, the drill settings (edited on the settings screen, consumed
 * by the drill builder), and the paired layout lifted from pairing events;
 * the live-session screen comes next.
 */
export default function App() {
  const transport = useMemo(() => new MockCentralTransport(), []);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"pair" | "drill">("pair");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<DrillSettings>(DEFAULT_SETTINGS);
  // Canonical spots bound by the last completed round, in bind (slot) order.
  const [pairedSpots, setPairedSpots] = useState<number[]>([]);

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "connection") {
        setConnection(e.state);
        setError(e.state === "error" ? (e.reason ?? "connection failed") : null);
      }
      if (e.kind === "pairing" && e.progress.done) {
        setPairedSpots(e.progress.boundSpots);
      }
    });
    return () => {
      unsub();
      transport.disconnect();
    };
  }, [transport]);

  const connected = connection === "connected";
  const busy = connection === "connecting";

  // Real BLE rejects routinely (Bluetooth off, not found, permissions) — the
  // state flip to "error" arrives via onStatus; the catch just stops the
  // rejection from being unhandled.
  const toggle = () => {
    (connected ? transport.disconnect() : transport.connect()).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ZoneDash</Text>
        <Pressable
          testID="settings-button"
          accessibilityRole="button"
          accessibilityLabel={settingsOpen ? "Close settings" : "Open settings"}
          onPress={() => setSettingsOpen((v) => !v)}
          style={({ pressed }) => [
            styles.headerButton,
            settingsOpen && styles.headerButtonActive,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.headerGlyph}>{settingsOpen ? "✕" : "⚙"}</Text>
        </Pressable>
      </View>

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={setSettings} />
      )}

      {/* The main content stays mounted under an open settings screen — a
          pairing round or a half-built drill must survive the visit. */}
      <View style={settingsOpen ? styles.hidden : styles.content}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              connected && styles.dotConnected,
              connection === "error" && styles.dotError,
            ]}
          />
          <Text style={styles.status}>
            {connected
              ? "Central unit: connected (mock)"
              : busy
                ? "Central unit: connecting…"
                : connection === "error"
                  ? `Central unit: ${error ?? "connection failed"}`
                  : "Central unit: not connected"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={toggle}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>
            {connected ? "Disconnect" : "Connect"}
          </Text>
        </Pressable>

        {connected && (
          <>
            <View style={styles.sectionRow}>
              {(["pair", "drill"] as const).map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityState={{ selected: section === s }}
                  onPress={() => setSection(s)}
                  style={[styles.section, section === s && styles.sectionActive]}
                >
                  <Text
                    style={[
                      styles.sectionLabel,
                      section === s && styles.sectionLabelActive,
                    ]}
                  >
                    {s === "pair" ? "Pairing" : "Drill"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* Both panels stay mounted — switching sections hides, not resets:
                a pairing round or a half-built drill must survive a tab flip. */}
            <View style={section === "pair" ? null : styles.hidden}>
              <PairingPanel transport={transport} />
            </View>
            <View style={section === "drill" ? null : styles.hidden}>
              <DrillPanel
                transport={transport}
                pairedSpots={pairedSpots}
                settings={settings}
              />
            </View>
          </>
        )}
      </View>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    paddingTop: 56, // clears the status bar without a safe-area dependency
  },
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonActive: {
    borderColor: "#818cf8",
    backgroundColor: "#1e1b4b",
  },
  headerGlyph: {
    color: "#fafafa",
    fontSize: 18,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  dotError: {
    backgroundColor: "#f87171",
  },
  status: {
    color: "#71717a",
    fontSize: 13,
  },
  button: {
    marginTop: 16,
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
  sectionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  section: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionActive: {
    backgroundColor: "#18181b",
  },
  sectionLabel: {
    color: "#71717a",
    fontSize: 14,
    fontWeight: "600",
  },
  sectionLabelActive: {
    color: "#fafafa",
  },
  hidden: {
    display: "none",
  },
});
