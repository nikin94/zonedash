import { StyleSheet, View } from "react-native";

import { useShallow } from "zustand/react/shallow";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { CourtMap, CourtStatusControl } from "../components/CourtMap";
import { DrillPanel } from "../components/DrillPanel";
import { PairingPanel } from "../components/PairingPanel";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { type SpotVisual } from "../helpers/court";
import { appendSession } from "../state/history";
import { useAppStore } from "../state/AppState";
import { colors } from "../theme";

const OFF_SPOTS: SpotVisual[] = Array.from({ length: 8 }, () => "off");

/**
 * The core tab — the court is always on it, and connection + pairing state layer
 * the surfaces on top, exactly as before, minus any chrome (the header + tabs
 * are the navigator's now):
 *  - disconnected → an idle court with a Connect hero button (loader while linking)
 *  - connected, not paired (or re-pairing) → the pairing surface
 *  - connected, paired, handed off → the drill controls
 *
 * The pairing → drill handoff and Re-pair now live in AppState (`drillView`), so
 * they survive a tab switch or a remount of this screen. The transport is read
 * from the store (owned above the navigator), so navigating away and back never
 * drops the live session — DrillPanel rehydrates from its snapshot.
 */
export const DrillScreen = () => {
  const {
    transport,
    connection,
    connectionError,
    pairedSpots,
    settings,
    setSettings,
    courtRotation,
    rotateCourt,
    drillView,
  } = useAppStore(
    useShallow((s) => ({
      transport: s.transport,
      connection: s.connection,
      connectionError: s.connectionError,
      pairedSpots: s.pairedSpots,
      settings: s.settings,
      setSettings: s.setSettings,
      courtRotation: s.courtRotation,
      rotateCourt: s.rotateCourt,
      drillView: s.drillView,
    })),
  );

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
          onSettingsChange={setSettings}
          rotation={courtRotation}
          onRotate={rotateCourt}
          statusControl={<CourtStatusControl />}
          onSessionComplete={(s) => void appendSession(s)}
        />
      ) : showPairing ? (
        <PairingPanel
          transport={transport}
          rotation={courtRotation}
          onRotate={rotateCourt}
          statusControl={<CourtStatusControl />}
        />
      ) : (
        <View style={styles.idle}>
          {/* A clean court with the status indicator in its corner. The connect
              action lives OUTSIDE it, below, mirroring the pairing surface's
              Start pairing hero — here it reads "Connect" until the link is up. */}
          <CourtMap
            spots={OFF_SPOTS}
            rotation={courtRotation}
            onRotate={rotateCourt}
            statusControl={<CourtStatusControl />}
          />
          <Button
            testID="connect-button"
            label="Connect"
            primary
            textSize={17}
            loading={connection === "connecting"}
            onPress={() => transport.connect().catch(() => {})}
            style={styles.connect}
          />
          {connection === "error" && (
            <AppText center size={13} color={colors.danger} style={styles.hint}>
              {connectionError ?? "Connection failed"}
            </AppText>
          )}
        </View>
      )}
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  idle: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  connect: {
    alignSelf: "stretch",
  },
  hint: {
    paddingHorizontal: 24,
  },
});
