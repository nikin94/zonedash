import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "../../components/AppText";
import { Header } from "../../components/Header";
import type { Nav } from "../../navigation";
import { useAppState } from "../../state/AppState";
import { colors } from "../../theme";
import { PairingPanel } from "./PairingPanel";

// Beat between the final bind and the handoff to Drill — long enough for the
// last dot's fade (CourtMap FADE_MS) plus a moment to register the green check.
const HANDOFF_DELAY_MS = 700;

/**
 * Pairing as its own screen, pushed from the header's central-unit menu. A
 * link drop pops the stack back home (Header handles that), so the panel only
 * renders while connected.
 */
export const PairingScreen = () => {
  const navigation = useNavigation<Nav>();
  const { transport, connection, pairedSpots } = useAppState();
  const paired = pairedSpots.length > 0;

  // Without a layout there is nowhere to go back TO: home immediately
  // redirects right back here, so a back affordance would only loop. Hide the
  // button AND the iOS swipe-back gesture until a round completes; both appear
  // once there is a layout to return to.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: paired });
  }, [navigation, paired]);

  // A successful round hands over to the Drill screen — but only after the last
  // bind's fade lands and its green check paints, so the operator sees the
  // target confirmed instead of the screen swapping mid-animation. Reset
  // instead of push so the stack is Home → Drill no matter how Pairing was
  // reached (fresh connect, or a re-pair opened from the chip menu on Drill).
  useEffect(() => {
    let handoff: ReturnType<typeof setTimeout> | null = null;
    const unsub = transport.onStatus((e) => {
      if (e.kind === "pairing" && e.progress.done && handoff === null) {
        handoff = setTimeout(() => {
          navigation.reset({
            index: 1,
            routes: [{ name: "Home" }, { name: "Drill" }],
          });
        }, HANDOFF_DELAY_MS);
      }
    });
    return () => {
      unsub();
      if (handoff !== null) clearTimeout(handoff);
    };
  }, [transport, navigation]);

  return (
    <View style={styles.screen}>
      <Header back={paired} title="Pairing" />
      {connection === "connected" ? (
        <PairingPanel transport={transport} />
      ) : (
        <AppText center size={13} color={colors.textMuted} style={styles.screenHint}>
          Not connected — tap the status in the header to connect
        </AppText>
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
  screenHint: {
    marginTop: 48,
    paddingHorizontal: 32,
  },
});
