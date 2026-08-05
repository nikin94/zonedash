import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { Header } from "../components/Header";
import type { Nav } from "../navigation";
import { useAppState } from "../state/AppState";
import { colors } from "../theme";

/**
 * The home screen — deliberately empty for now: the functionality is split
 * into its own screens (Pairing, Drill, Settings), all reached from the
 * header. Home content (recent results, quick actions) lands here later.
 * While the link is up with nothing paired, home hands straight over to the
 * Pairing screen — an unpaired session has nothing to do anywhere else.
 */
export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const { connection, pairedSpots } = useAppState();
  const connected = connection === "connected";
  const paired = pairedSpots.length > 0;

  useFocusEffect(
    useCallback(() => {
      if (connected && !paired) navigation.navigate("Pairing");
    }, [connected, paired, navigation]),
  );

  return (
    <View style={styles.screen}>
      <Header />
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
