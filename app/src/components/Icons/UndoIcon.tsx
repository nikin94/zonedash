import { StyleSheet, View } from "react-native";

import { colors } from "../../theme";

// A counter-clockwise circular arrow — the undo affordance. Built from a
// 3/4 ring (one border side left transparent for the gap) plus a two-bar
// arrowhead at the gap, so it reads as "loop back" without an icon font.
const R = 16; // ring diameter
const STROKE = 2;

/** Circular "undo" arrow, sized for the ~44 px action buttons. */
export const UndoIcon = () => (
  <View style={styles.box} accessible={false}>
    <View style={styles.ring} />
    <View style={[styles.head, styles.headA]} />
    <View style={[styles.head, styles.headB]} />
  </View>
);

const styles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // 3/4 circle: the top border is dropped, leaving a gap at the top where the
  // arrowhead sits. Rotated so the opening points up-left, like a reload glyph.
  ring: {
    width: R,
    height: R,
    borderRadius: R / 2,
    borderWidth: STROKE,
    borderColor: colors.text,
    borderTopColor: "transparent",
    transform: [{ rotate: "-45deg" }],
  },
  // Two short bars meeting at a point — the arrowhead tipping the open end.
  head: {
    position: "absolute",
    width: 6,
    height: STROKE,
    borderRadius: STROKE / 2,
    backgroundColor: colors.text,
    top: 2,
    left: 4,
  },
  headA: { transform: [{ rotate: "50deg" }] },
  headB: { transform: [{ rotate: "-20deg" }], top: 5, left: 3 },
});
