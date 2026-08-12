import { useState } from "react";
import { Modal, StyleSheet, View } from "react-native";

import { useShallow } from "zustand/react/shallow";

import type { ConnectionState } from "../../ble/transport";
import { useAppStore } from "../../state/AppState";
import { alpha, colors, glowShadow } from "../../theme";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { ConfirmModal } from "../ConfirmModal";
import { CustomPressable } from "../CustomPressable";

/** The status dot's colour per connection state — success/amber/red/muted, the
 *  same vocabulary the old header chip used, now the only status affordance. */
const DOT_COLOR: Record<ConnectionState, string> = {
  connected: colors.success,
  connecting: colors.warning,
  error: colors.danger,
  disconnected: colors.textMuted,
};

/** One-line status label shown in the modal. */
const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  error: "Connection failed",
  disconnected: "Offline",
};

/**
 * The central-unit status indicator, living ON the court (mirroring the rotate
 * control on the opposite corner) instead of the header. A small dot coloured by
 * connection state; tapping it opens a MODAL (not a dropdown) with the link
 * actions that used to drop from the header chip — Connect while offline,
 * Re-pair + Disconnect while connected. Destructive actions still confirm.
 *
 * Self-contained: it reads connection + the transport straight from the store,
 * so any court surface can drop it into CourtMap's `statusControl` slot with no
 * prop threading. Re-pair calls `resetToPairing` directly — the court is a
 * Drill-tab surface, so there's nothing to navigate.
 */
export const CourtStatusControl = () => {
  const {
    connection,
    connectionError,
    transport,
    pairedSpots,
    resetToPairing,
  } = useAppStore(
    useShallow((s) => ({
      connection: s.connection,
      connectionError: s.connectionError,
      transport: s.transport,
      pairedSpots: s.pairedSpots,
      resetToPairing: s.resetToPairing,
    })),
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [disconnectAsk, setDisconnectAsk] = useState(false);
  const [repairAsk, setRepairAsk] = useState(false);

  const connected = connection === "connected";
  const busy = connection === "connecting";
  const paired = pairedSpots.length > 0;

  const connect = () => {
    setMenuOpen(false);
    // The catch stops a routine BLE reject (Bluetooth off, not found) from being
    // unhandled; the state flip to "error" arrives via onStatus.
    transport.connect().catch(() => {});
  };
  const askRepair = () => {
    setMenuOpen(false);
    setRepairAsk(true);
  };
  const repair = () => {
    setRepairAsk(false);
    resetToPairing();
  };
  const askDisconnect = () => {
    setMenuOpen(false);
    setDisconnectAsk(true);
  };
  const disconnect = () => {
    setDisconnectAsk(false);
    // Dropping the link clears the paired layout (AppState); the Drill screen
    // falls back to its disconnected surface on its own.
    transport.disconnect().catch(() => {});
  };

  return (
    <>
      <CustomPressable
        noFeedback
        hitSlop={10}
        testID="court-status"
        accessibilityLabel={`Central unit: ${STATUS_LABEL[connection]}`}
        onPress={() => setMenuOpen(true)}
        style={styles.control}
      >
        <View
          testID={`court-status-dot-${connection}`}
          style={[styles.cornerDot, { backgroundColor: DOT_COLOR[connection] }]}
        />
      </CustomPressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.scrim}>
          <CustomPressable
            noFeedback
            testID="court-status-backdrop"
            accessibilityLabel="Dismiss central unit menu"
            onPress={() => setMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.card} testID="court-status-modal">
            <AppText
              size={12}
              color={colors.textSecondary}
              style={styles.heading}
            >
              Central unit
            </AppText>
            <View style={styles.statusRow}>
              <View
                style={[styles.dot, { backgroundColor: DOT_COLOR[connection] }]}
              />
              <AppText size={15} weight="600">
                {STATUS_LABEL[connection]}
              </AppText>
            </View>
            {connection === "error" && connectionError !== null && (
              <AppText size={13} color={colors.danger}>
                {connectionError}
              </AppText>
            )}

            {connected ? (
              <>
                {paired && (
                  <Button
                    testID="repair-button"
                    label="Re-pair targets"
                    onPress={askRepair}
                    style={styles.action}
                  />
                )}
                <Button
                  testID="disconnect-button"
                  label="Disconnect"
                  danger
                  onPress={askDisconnect}
                  style={styles.action}
                />
              </>
            ) : (
              <Button
                testID="status-connect"
                label="Connect"
                primary
                loading={busy}
                onPress={connect}
                style={styles.action}
              />
            )}
          </View>
        </View>
      </Modal>

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
    </>
  );
};

const styles = StyleSheet.create({
  // The dot's tap target — CourtMap positions this slot; here it just centres
  // the dot and widens the touch area (hitSlop) beyond the small glyph.
  control: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // The corner status indicator — the same small footprint the header status
  // dot had (8 px), so it reads as a discreet link light in the court corner.
  cornerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // The larger inline dot in the modal's status row, paired with the 15 px label.
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: alpha(colors.scrim, 0.5),
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 14,
    ...glowShadow,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  action: {
    alignSelf: "stretch",
  },
});
