import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ConnectionState } from "../ble/transport";
import { useAppState } from "../state/AppState";
import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { ConfirmModal } from "./ConfirmModal";
import { CustomPressable } from "./CustomPressable";
import { HistoryIcon, SlidersIcon } from "./Icons";

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
 * while connected it opens a dropdown holding Re-pair (only with a layout to
 * rebind) and Disconnect (behind a confirm). The gear opens the settings modal
 * — the app has one screen, so nothing here navigates.
 */
export const Header = ({
  onOpenSettings,
  onOpenHistory,
  onRepair,
}: {
  onOpenSettings: () => void;
  /** Open the session-history modal. */
  onOpenHistory: () => void;
  /** Re-open the pairing surface to rebind the layout. Offered in the chip
   *  menu only once a layout exists. */
  onRepair?: () => void;
}) => {
  const { transport, connection, pairedSpots } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [disconnectAsk, setDisconnectAsk] = useState(false);
  const [repairAsk, setRepairAsk] = useState(false);

  const connected = connection === "connected";
  const busy = connection === "connecting";
  const paired = pairedSpots.length > 0;

  const onChipPress = () => {
    if (connected) {
      setMenuOpen((v) => !v);
      return;
    }
    // The catch stops a routine BLE reject (Bluetooth off, not found) from
    // being unhandled; the state flip to "error" arrives via onStatus.
    transport.connect().catch(() => {});
  };

  const askRepair = () => {
    setMenuOpen(false);
    setRepairAsk(true);
  };

  const repair = () => {
    setRepairAsk(false);
    onRepair?.();
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
                {/* Re-pair rebinds the layout — only meaningful once one
                    exists (i.e. on the drill surface). */}
                {paired && onRepair && (
                  <>
                    <CustomPressable
                      testID="repair-button"
                      onPress={askRepair}
                      style={styles.menuItem}
                    >
                      <AppText weight="600">Re-pair targets</AppText>
                    </CustomPressable>
                    <View style={styles.menuDivider} />
                  </>
                )}
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
          testID="history-button"
          accessibilityLabel="Open session history"
          onPress={onOpenHistory}
          style={styles.headerButton}
        >
          <HistoryIcon />
        </CustomPressable>

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

      <ConfirmModal
        visible={repairAsk}
        onDismiss={() => setRepairAsk(false)}
        testID="repair-confirm"
        title="Re-pair the targets?"
        body="This starts a new pairing round and discards the current layout."
        actions={[
          { label: "Keep going", onPress: () => setRepairAsk(false) },
          { label: "Re-pair", danger: true, onPress: repair },
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
  // Padding matched to the shared Button (regular) so a menu item and a button
  // read as the same control.
  menuItem: {
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 12,
    backgroundColor: colors.border,
  },
});
