import { StyleSheet, View } from "react-native";

import { colors } from "../../theme";

/**
 * A ✓ built from two rotated bars — sized for the 38 px court dots, drawn in
 * the page color so it reads on the emerald bound/hit fill. Pure Views (no
 * icon font / emoji).
 */
export const CheckIcon = () => (
  <View style={styles.box} accessible={false}>
    <View style={[styles.bar, styles.barShort]} />
    <View style={[styles.bar, styles.barLong]} />
  </View>
);

const styles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
  },
  bar: {
    position: "absolute",
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: colors.background, // page color on the emerald bound fill
  },
  barShort: {
    width: 7,
    left: 0.5,
    top: 9,
    transform: [{ rotate: "45deg" }],
  },
  barLong: {
    width: 12,
    left: 4,
    top: 7.5,
    transform: [{ rotate: "-45deg" }],
  },
});
