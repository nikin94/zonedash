import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Header } from "../../components/Header";
import type { Nav } from "../../navigation";
import { useAppState } from "../../state/AppState";
import { colors } from "../../theme";
import { DrillPanel } from "./DrillPanel";

/** The Drill screen: Header + the drill panel, gated on the link and the
 *  paired layout (a drill runs on the layout the pairing round bound). */
export const DrillScreen = () => {
  const navigation = useNavigation<Nav>();
  const { transport, connection, pairedSpots, settings } = useAppState();
  const connected = connection === "connected";
  const paired = pairedSpots.length > 0;

  // Mirror the central's running flag so the screen can't be left mid-run.
  // Seed from the session snapshot (not a bare false) so a remount over a live
  // run locks the exit on the first frame, then keep it in sync with events —
  // the central only re-emits `running` on StartSession, never on (re)mount.
  // Hide the back chevron AND the iOS swipe-back gesture while running; the
  // only way out is Stop (in the panel). Same UI-cache-vs-truth fix as
  // pairedSpots, on the session axis.
  const [running, setRunning] = useState(
    () => transport.sessionSnapshot.state === "running",
  );
  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "session") setRunning(e.state === "running");
    });
    return unsub;
  }, [transport]);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !running });
  }, [navigation, running]);

  // A drill only makes sense over a live link and a paired layout. Losing
  // either (link drop, layout cleared) sends the operator back home, where
  // the unpaired redirect takes over if the link is still up.
  useFocusEffect(
    useCallback(() => {
      if (!connected || !paired) navigation.popToTop();
    }, [connected, paired, navigation]),
  );

  return (
    <View style={styles.screen}>
      <Header back lockBack={running} title="Drill" />
      {connected && paired && (
        <DrillPanel
          transport={transport}
          pairedSpots={pairedSpots}
          settings={settings}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56, // clears the status bar without a safe-area dependency
  },
});
