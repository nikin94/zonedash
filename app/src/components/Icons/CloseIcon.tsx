import { StyleSheet, View } from "react-native";

import { colors } from "../../theme";

const W = 18;

/**
 * A thin ✕ built from two rotated bars. Pure Views (no icon font / emoji);
 * sized for the 44 px header buttons.
 */
export const CloseIcon = () => (
  <View style={styles.box} accessible={false}>
    <View style={[styles.bar, styles.barA]} />
    <View style={[styles.bar, styles.barB]} />
  </View>
);

const styles = StyleSheet.create({
  box: {
    width: W,
    height: W,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    position: "absolute",
    width: W,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
  },
  barA: {
    transform: [{ rotate: "45deg" }],
  },
  barB: {
    transform: [{ rotate: "-45deg" }],
  },
});
