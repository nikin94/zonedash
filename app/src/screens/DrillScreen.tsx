import { StyleSheet, View } from "react-native";

import { AppText } from "../components/AppText";
import { CourtMap } from "../components/CourtMap";
import { DrillPanel } from "../components/DrillPanel";
import { PairingPanel } from "../components/PairingPanel";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { type SpotVisual } from "../helpers/court";
import { appendSession } from "../state/history";
import { useAppState } from "../state/AppState";
import { colors } from "../theme";

const OFF_SPOTS: SpotVisual[] = Array.from({ length: 8 }, () => "off");

/**
 * The core tab — the court is always on it, and connection + pairing state layer
 * the surfaces on top, exactly as before, minus any chrome (the header + tabs
 * are the navigator's now):
 *  - disconnected → an idle court with a connect hint (the header pill connects)
 *  - connected, not paired (or re-pairing) → the pairing surface
 *  - connected, paired, handed off → the drill controls
 *
 * The pairing → drill handoff and Re-pair now live in AppState (`drillView`), so
 * they survive a tab switch or a remount of this screen. The transport is read
 * from context (owned above the navigator), so navigating away and back never
 * drops the live session — DrillPanel rehydrates from its snapshot.
 */
export const DrillScreen = () => {
  const {
    transport,
    connection,
    connectionError,
    pairedSpots,
    settings,
    courtRotation,
    rotateCourt,
    drillView,
  } = useAppState();

  const connected = connection === "connected";
  const paired = pairedSpots.length > 0;
  const showDrill = connected && paired && drillView === "drill";
  const showPairing = connected && !showDrill;

  return (
    <ScreenWrapper>
      {showDrill ? (
        <DrillPanel
          transport={transport}
          pairedSpots={pairedSpots}
          settings={settings}
          rotation={courtRotation}
          onRotate={rotateCourt}
          onSessionComplete={(s) => void appendSession(s)}
        />
      ) : showPairing ? (
        <PairingPanel
          transport={transport}
          rotation={courtRotation}
          onRotate={rotateCourt}
        />
      ) : (
        <View style={styles.idle}>
          {/* A clean court — the connect hint lives OUTSIDE it, below, like the
              pairing and drill surfaces. */}
          <CourtMap
            spots={OFF_SPOTS}
            rotation={courtRotation}
            onRotate={rotateCourt}
          />
          <AppText
            center
            size={13}
            color={colors.textMuted}
            style={styles.hint}
          >
            {connection === "connecting"
              ? "Connecting to the central unit…"
              : connection === "error"
                ? `${connectionError ?? "Connection failed"} — tap the status to retry`
                : "Tap the status in the header to connect"}
          </AppText>
        </View>
      )}
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  idle: {
    alignItems: "center",
    gap: 12,
  },
  hint: {
    paddingHorizontal: 24,
  },
});
