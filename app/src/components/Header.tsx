import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ConnectionState } from "../ble/transport";
import type { Nav } from "../navigation";
import { useAppState } from "../state/AppState";
import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { ConfirmDialog } from "./ConfirmDialog";
import { CustomPressable } from "./CustomPressable";
import { BackIcon, SlidersIcon } from "./Icons";

/** Brief status-chip label per connection state. */
const CHIP_LABEL: Record<ConnectionState, string> = {
  connected: "mock", // the device name once real BLE lands
  connecting: "…",
  error: "error",
  disconnected: "offline",
};

/**
 * The app header, shared by every screen: title on the left (with a back
 * affordance on pushed screens), the central-unit status chip and the settings
 * button on the right. While connected the chip opens a dropdown menu —
 * Pairing (its own screen) and Disconnect (behind the confirm); while
 * disconnected a chip tap just connects (non-destructive, no menu needed).
 */
export const Header = ({ back, title = "ZoneDash" }: { back?: boolean; title?: string }) => {
  const navigation = useNavigation<Nav>();
  const { transport, connection, pairedSpots } = useAppState();
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

  const openPairing = () => {
    setMenuOpen(false);
    navigation.navigate("Pairing");
  };

  const openDrill = () => {
    setMenuOpen(false);
    navigation.navigate("Drill");
  };

  const askDisconnect = () => {
    setMenuOpen(false);
    setDisconnectAsk(true);
  };

  const disconnect = () => {
    setDisconnectAsk(false);
    // Drop the link BEFORE popping: home redirects to Pairing while connected
    // and unpaired, so it must regain focus already disconnected — otherwise
    // the redirect would bounce right back here.
    transport.disconnect().catch(() => {});
    // A drop invalidates any pushed screen's context — land back on home.
    // Keyed on the stack, not the back prop: a pushed screen may hide its
    // back button (Pairing before a layout exists) yet still need the pop.
    if (navigation.canGoBack()) navigation.popToTop();
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {back && (
          <CustomPressable
            testID="header-back"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
          >
            <BackIcon />
          </CustomPressable>
        )}
        <AppText size={20} weight="700" style={styles.headerTitle}>
          {title}
        </AppText>
      </View>

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
                {/* Drill needs a paired layout — the item exists only then. */}
                {pairedSpots.length > 0 && (
                  <>
                    <CustomPressable onPress={openDrill} style={styles.menuItem}>
                      <AppText weight="600">Drill</AppText>
                    </CustomPressable>
                    <View style={styles.menuDivider} />
                  </>
                )}
                <CustomPressable onPress={openPairing} style={styles.menuItem}>
                  <AppText weight="600">Pairing</AppText>
                </CustomPressable>
                <View style={styles.menuDivider} />
                <CustomPressable onPress={askDisconnect} style={styles.menuItem}>
                  <AppText weight="600" color={colors.danger}>
                    Disconnect
                  </AppText>
                </CustomPressable>
              </View>
            </>
          )}
        </View>

        {!back && (
          <CustomPressable
            testID="settings-button"
            accessibilityLabel="Open settings"
            onPress={() => navigation.navigate("Settings")}
            style={styles.headerButton}
          >
            <SlidersIcon />
          </CustomPressable>
        )}
      </View>

      {disconnectAsk && (
        <>
          {/* Tap anywhere outside the dialog = No. */}
          <CustomPressable
            noFeedback
            testID="disconnect-backdrop"
            accessibilityLabel="Dismiss disconnect dialog"
            onPress={() => setDisconnectAsk(false)}
            style={styles.confirmBackdrop}
          />
          <View pointerEvents="box-none" style={styles.confirmWrap}>
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
          </View>
        </>
      )}
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  // Chrome-matched to the wheel dropdown: black fill, same border, soft glow.
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
    ...glowShadow,
  },
  menuItem: {
    height: 48, // fingertip-sized
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  confirmBackdrop: {
    position: "absolute",
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
  },
  confirmWrap: {
    // Full-width strip under the header, centering the card horizontally —
    // an absolute child of a row can't center itself with alignSelf.
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  confirmCard: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    ...glowShadow,
  },
});
