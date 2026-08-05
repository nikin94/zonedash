import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { MockCentralTransport } from "./src/ble/mock";
import type { ConnectionState } from "./src/ble/transport";
import { AppText } from "./src/components/AppText";
import { ConfirmDialog } from "./src/components/ConfirmDialog";
import { CloseIcon, SlidersIcon } from "./src/components/Icons";
import { DrillPanel } from "./src/screens/DrillPanel";
import { PairingPanel } from "./src/screens/PairingPanel";
import {
  DEFAULT_SETTINGS,
  SettingsPanel,
  type DrillSettings,
} from "./src/screens/SettingsPanel";
import { colors, glowShadow } from "./src/theme";

/** Brief status-chip label per connection state. */
const CHIP_LABEL: Record<ConnectionState, string> = {
  connected: "mock", // the device name once real BLE lands
  connecting: "…",
  error: "error",
  disconnected: "offline",
};

/**
 * ZoneDash operator app. Talks to the central unit through the CentralTransport
 * seam — currently the in-app mock, later the real BLE implementation. This
 * screen owns the header (title, central-unit status chip, settings), the
 * connection, the Pair/Drill section switch, the drill settings, and the
 * paired layout lifted from pairing events; the live-session screen comes next.
 */
const App = () => {
  const transport = useMemo(() => new MockCentralTransport(), []);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"pair" | "drill">("pair");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<DrillSettings>(DEFAULT_SETTINGS);
  // The header chip's only destructive action — confirmed before it runs.
  const [disconnectAsk, setDisconnectAsk] = useState(false);
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

  // Disconnect is the chip's only action while connected, so the tap goes
  // straight to the confirm (no single-item dropdown). Once real BLE brings
  // more actions — scan/pick device, link details — this becomes a menu.
  const onChipPress = () => {
    if (connected) {
      setDisconnectAsk(true);
      return;
    }
    // Connecting is non-destructive — no confirm needed. The catch stops a
    // routine BLE reject (Bluetooth off, not found) from being unhandled;
    // the state flip to "error" arrives via onStatus.
    transport.connect().catch(() => {});
  };

  const disconnect = () => {
    setDisconnectAsk(false);
    transport.disconnect().catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText style={styles.headerTitle}>ZoneDash</AppText>
        <View style={styles.headerRight}>
          <Pressable
            testID="status-chip"
            accessibilityRole="button"
            accessibilityLabel={`Central unit: ${CHIP_LABEL[connection]}`}
            disabled={busy}
            onPress={onChipPress}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.buttonPressed,
            ]}
          >
            <View
              style={[
                styles.dot,
                connected && styles.dotConnected,
                connection === "error" && styles.dotError,
              ]}
            />
            <AppText style={styles.chipLabel}>{CHIP_LABEL[connection]}</AppText>
          </Pressable>
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
            {settingsOpen ? <CloseIcon /> : <SlidersIcon />}
          </Pressable>
        </View>
      </View>

      {disconnectAsk && (
        <>
          {/* Tap anywhere outside the dialog = No. */}
          <Pressable
            testID="disconnect-backdrop"
            accessibilityLabel="Dismiss disconnect dialog"
            style={styles.confirmBackdrop}
            onPress={() => setDisconnectAsk(false)}
          />
          <View style={styles.confirmCard}>
            <ConfirmDialog
              testID="disconnect-confirm"
              title="Disconnect from the central unit?"
              actions={[
                { label: "No", onPress: () => setDisconnectAsk(false) },
                { label: "Yes", danger: true, onPress: disconnect },
              ]}
            />
          </View>
        </>
      )}

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={setSettings} />
      )}

      {/* The main content stays mounted under an open settings screen — a
          pairing round or a half-built drill must survive the visit. */}
      <View style={settingsOpen ? styles.hidden : styles.content}>
        {connected ? (
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
                  <AppText
                    style={[
                      styles.sectionLabel,
                      section === s && styles.sectionLabelActive,
                    ]}
                  >
                    {s === "pair" ? "Pairing" : "Drill"}
                  </AppText>
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
        ) : (
          <AppText style={styles.hint}>
            {busy
              ? "Connecting to the central unit…"
              : connection === "error"
                ? `${error ?? "Connection failed"} — tap the status in the header to retry`
                : "Not connected — tap the status in the header to connect"}
          </AppText>
        )}
      </View>

      <StatusBar style="light" />
    </View>
  );
};

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56, // clears the status bar without a safe-area dependency
  },
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 20, // the disconnect dialog overlays the content below
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44, // fingertip-sized like the other header controls
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  dotConnected: {
    backgroundColor: colors.success,
  },
  dotError: {
    backgroundColor: colors.danger,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  confirmBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  confirmCard: {
    // Drops in just under the header, chrome-matched to the wheel dropdown:
    // black fill, same border/rounding, soft white glow for separation.
    position: "absolute",
    top: 112,
    alignSelf: "center",
    zIndex: 30,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    ...glowShadow,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  buttonPressed: {
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  sectionLabelActive: {
    color: colors.text,
  },
  hidden: {
    display: "none",
  },
});
