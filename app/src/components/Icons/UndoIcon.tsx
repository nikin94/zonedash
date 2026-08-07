import { StyleSheet, View } from "react-native";

import { colors } from "../../theme";

// A counter-clockwise circular arrow — the undo affordance. A 3/4 ring (the top
// border dropped for the gap) plus a solid left-pointing arrowhead at the
// top-left end of the gap, so the arc reads as looping back to the left = undo.
const R = 16; // ring diameter
const STROKE = 2;

/** Circular "undo" arrow, sized for the ~44 px action buttons. */
export const UndoIcon = () => (
  <View style={styles.box} accessible={false}>
    <View style={styles.ring} />
    <View style={styles.head} />
  </View>
);

const styles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // 3/4 circle: the top border is dropped, leaving a gap across the top whose
  // ends sit at ~10:30 (top-left) and ~1:30 (top-right).
  ring: {
    width: R,
    height: R,
    borderRadius: R / 2,
    borderWidth: STROKE,
    borderColor: colors.text,
    borderTopColor: "transparent",
  },
  // A left-pointing triangle (border trick) at the top-left end of the gap —
  // the arrowhead the arc curls back toward. Points left = undo, not redo.
  head: {
    position: "absolute",
    top: 0,
    left: 1,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: colors.text,
  },
});
