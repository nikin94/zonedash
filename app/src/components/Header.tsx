import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ConnectionState } from "../ble/transport";
import { useAppState } from "../state/AppState";
import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { ConfirmModal } from "./ConfirmModal";
import { CustomPressable } from "./CustomPressable";
import { SlidersIcon } from "./Icons";

/** Brief status-chip label per connection state. */
const CHIP_LABEL: Record<ConnectionState, string> = {
  connected: "mock", // the device name once real BLE lands
  connecting: "connecting",
  error: "error",
  disconnected: "offline",
};

/**
 * The single app header: the title on the left, the central-unit status chip
 * and the settings gear on the right. A chip tap connects while disconnected;
 * while connected it opens a dropdown holding Disconnect (behind a confirm).
 * The gear opens the settings modal — the app has one screen, so nothing here
 * navigates.
 */
export const Header = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const { transport, connection } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [disconnectAsk, setDisconnectAsk] = useState(false);

  const connected = connection === "connected";
  const busy = connection === "connecting";

  const onChipPress = () => {
    if (connected) {
      setMenuOpen((v) => !v);
      return;
    }
    // The catch stops a routine BLE reject (Bluetooth off, not found) from
    // being unhandled; the state flip to "error" arrives via onStatus.
    transport.connect().catch(() => {});
  };

  const askDisconnect = () => {
    setMenuOpen(false);
    setDisconnectAsk(true);
  };

  const disconnect = () => {
    setDisconnectAsk(false);
    // Dropping the link clears the paired layout (AppState), so the single
    // screen falls back to its disconnected surface on its own.
    transport.disconnect().catch(() => {});
  };

  return (
    <View style={styles.header}>
      <AppText size={20} weight="700" style={styles.headerTitle}>
        ZoneDash
      </AppText>

      <View style={styles.headerRight}>
        <View>
          <CustomPressable
            disabled={busy}
            testID="status-chip"
            accessibilityLabel={`Central unit: ${CHIP_LABEL[connection]}`}
            onPress={onChipPress}
            style={[styles.chip, menuOpen && styles.chipActive]}
          >
            <View
              style={[
                styles.dot,
                connected && styles.dotConnected,
                busy && styles.dotConnecting,
                connection === "error" && styles.dotError,
              ]}
            />
            <AppText size={13} weight="600" color={colors.textSecondary}>
              {CHIP_LABEL[connection]}
            </AppText>
          </CustomPressable>

          {menuOpen && (
            <>
              {/* Oversized invisible catcher: any tap outside dismisses. */}
              <CustomPressable
                noFeedback
                testID="chip-menu-backdrop"
                accessibilityLabel="Close central unit menu"
                onPress={() => setMenuOpen(false)}
                style={styles.menuBackdrop}
              />
              <View testID="chip-menu" style={styles.menu}>
                <CustomPressable
                  onPress={askDisconnect}
                  style={styles.menuItem}
                >
                  <AppText weight="600" color={colors.danger}>
                    Disconnect
                  </AppText>
                </CustomPressable>
              </View>
            </>
          )}
        </View>

        <CustomPressable
          testID="settings-button"
          accessibilityLabel="Open settings"
          onPress={onOpenSettings}
          style={styles.headerButton}
        >
          <SlidersIcon />
        </CustomPressable>
      </View>

      <ConfirmModal
        visible={disconnectAsk}
        onDismiss={() => setDisconnectAsk(false)}
        testID="disconnect-confirm"
        title="Disconnect from the central unit?"
        actions={[
          { label: "No", onPress: () => setDisconnectAsk(false) },
          { label: "Yes", danger: true, onPress: disconnect },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 20, // the menu and the disconnect dialog overlay the content below
  },
  headerTitle: {
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
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
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
  dotConnecting: {
    backgroundColor: colors.warning,
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
  menuBackdrop: {
    position: "absolute",
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
  },
  // Chrome-matched to the wheel dropdown: page fill, same border, soft shadow.
  menu: {
    position: "absolute",
    top: 50,
    right: 0,
    minWidth: 168,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 6,
    // Clip a pressed item's fill to the rounded corners — otherwise its
    // rectangular highlight bleeds over the menu's radius.
    overflow: "hidden",
    ...glowShadow,
  },
  menuItem: {
    height: 48, // fingertip-sized
    justifyContent: "center",
    paddingHorizontal: 20,
  },
});
