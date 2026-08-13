import { StyleSheet, View } from "react-native";

import { useShallow } from "zustand/react/shallow";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { CourtMap, CourtStatusControl } from "../components/CourtMap";
import { DrillPanel } from "../components/DrillPanel";
import { PairingPanel } from "../components/PairingPanel";
import { ScreenWrapper } from "../components/ScreenWrapper";
import {
  COURT_ACTION_GAP,
  COURT_STRIP_H,
  type SpotVisual,
} from "../helpers/court";
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
    playerName,
    setPlayerName,
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
      playerName: s.playerName,
      setPlayerName: s.setPlayerName,
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
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
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
        <View testID="idle-surface" style={styles.idle}>
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

// The idle column's inter-child gap (court → Connect → error hint).
const IDLE_GAP = 12;

const styles = StyleSheet.create({
  idle: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: IDLE_GAP,
    paddingHorizontal: 24,
  },
  // Land Connect the shared COURT_ACTION_GAP below the court's visual bottom —
  // same technique as the drill/pairing surfaces: pull up to cancel the court's
  // reserved bottom strip and the column gap, so the court→button distance is
  // the one shared value rather than a raw (strip + gap) that reads too large.
  connect: {
    alignSelf: "stretch",
    marginTop: COURT_ACTION_GAP - COURT_STRIP_H - IDLE_GAP,
  },
  hint: {
    paddingHorizontal: 24,
  },
});
