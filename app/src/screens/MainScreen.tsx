import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "../components/AppText";
import { CourtMap } from "../components/CourtMap";
import { Header } from "../components/Header";
import { SettingsModal } from "../components/SettingsModal";
import { type SpotVisual } from "../helpers/court";
import { useAppState } from "../state/AppState";
import { colors } from "../theme";
import { DrillPanel } from "../components/DrillPanel";
import { PairingPanel } from "../components/PairingPanel";

const OFF_SPOTS: SpotVisual[] = Array.from({ length: 8 }, () => "off");

// Beat between the final bind and revealing the drill controls — long enough
// for the last dot's fade + green check to register before the surface swaps.
const HANDOFF_DELAY_MS = 700;

/**
 * The one and only screen. The court is always on it; everything else layers on
 * top of connection + pairing state, with no navigation:
 *  - disconnected → an idle court with a connect hint (the header chip connects)
 *  - connected, not paired (or re-pairing) → the pairing surface (PairingPanel)
 *  - connected, paired → the drill surface + controls under the court (DrillPanel)
 *
 * A completed round doesn't reveal the drill controls instantly: `view` lags a
 * beat so the last bind's green check paints first. Re-pair flips `view` back to
 * the pairing surface; a link drop resets it (AppState clears pairedSpots too).
 * Settings is a modal opened from the header gear — the app has no stack.
 */
export const MainScreen = () => {
  const {
    transport,
    connection,
    connectionError,
    pairedSpots,
    settings,
    setSettings,
  } = useAppState();
  const connected = connection === "connected";
  const paired = pairedSpots.length > 0;

  const [settingsOpen, setSettingsOpen] = useState(false);
  // "pairing" until a completed round's handoff elapses; "drill" once the
  // controls are revealed. Re-pair sends it back to "pairing".
  const [view, setView] = useState<"pairing" | "drill">("pairing");

  useEffect(() => {
    let handoff: ReturnType<typeof setTimeout> | null = null;
    const unsub = transport.onStatus((e) => {
      if (e.kind === "pairing" && e.progress.done && handoff === null) {
        handoff = setTimeout(() => setView("drill"), HANDOFF_DELAY_MS);
      }
      // A link drop invalidates any layout — fall back to the pairing surface
      // for the next session (pairedSpots is cleared in AppState).
      if (e.kind === "connection" && e.state !== "connected")
        setView("pairing");
    });
    return () => {
      unsub();
      if (handoff !== null) clearTimeout(handoff);
    };
  }, [transport]);

  const showDrill = connected && paired && view === "drill";
  // The pairing surface holds the same PairingPanel instance across the
  // just-paired → handoff window, so its "Paired N" + green checks stay up
  // until `view` flips to drill.
  const showPairing = connected && !showDrill;

  return (
    <View style={styles.screen}>
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      {showDrill ? (
        <DrillPanel
          transport={transport}
          pairedSpots={pairedSpots}
          settings={settings}
          onRepair={() => setView("pairing")}
        />
      ) : showPairing ? (
        <PairingPanel transport={transport} />
      ) : (
        <View style={styles.idle}>
          <CourtMap spots={OFF_SPOTS}>
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
          </CourtMap>
        </View>
      )}

      <SettingsModal
        visible={settingsOpen}
        onDismiss={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56, // clears the status bar without a safe-area dependency
  },
  idle: {
    marginTop: 32,
    alignItems: "center",
  },
  hint: {
    paddingHorizontal: 24,
  },
});
