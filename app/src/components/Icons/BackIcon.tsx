import { StyleSheet, View } from "react-native";

import { colors } from "../../theme";

const W = 18;

/**
 * A ‹ chevron built from two rotated bars — the header back affordance. Pure
 * Views (no icon font / emoji); sized for the 44 px header buttons.
 */
export const BackIcon = () => (
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
    width: 11,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
    left: 3,
  },
  barA: {
    top: 5,
    transform: [{ rotate: "-45deg" }],
  },
  barB: {
    bottom: 5,
    transform: [{ rotate: "45deg" }],
  },
});
