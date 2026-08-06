import { StyleSheet, View, type ViewStyle } from "react-native";

import { colors } from "../../theme";
import { SPOT_XY } from "./geometry";

// Glyph geometry — a small self-contained box, independent of the full map.
const ICON = 22; // glyph box side
const ICON_RING = 9; // centred circle diameter
const ICON_BAR = 2; // court-fragment stroke width
const ICON_ARM = 7; // corner-bracket arm length
const ICON_EDGE = 11; // net/back/side edge-line length
const ICON_M = 1; // gap from the box edge

/**
 * Compact court-position glyph for a spot: a centred ring plus a fragment of
 * the court edge marking WHERE on the perimeter the spot sits — a corner
 * bracket for the four corners (e.g. FL → top-left bracket), a horizontal edge
 * line for the net/back centres (FC/BC), a vertical side line for the mid sides
 * (e.g. MR → a line right of the ring). The fragment is derived from the spot's
 * normalised (x,y), not hardcoded per spot. Decorative: the SPOT_CODES letters
 * and SPOT_NAMES carry the meaning for screen readers.
 */
export const SpotIcon = ({ spot }: { spot: number }) => {
  const p = SPOT_XY[spot] as { x: number; y: number } | undefined;

  const bars: ViewStyle[] = [];
  if (p != null) {
    const vEdge: ViewStyle = p.y === 0 ? { top: ICON_M } : { bottom: ICON_M };
    const hEdge: ViewStyle = p.x === 0 ? { left: ICON_M } : { right: ICON_M };
    if (p.x === 0.5) {
      // net (top) or back (bottom) centre — horizontal edge line
      bars.push({
        position: "absolute",
        width: ICON_EDGE,
        height: ICON_BAR,
        left: (ICON - ICON_EDGE) / 2,
        ...vEdge,
      });
    } else if (p.y === 0.5) {
      // mid left / right — vertical side line
      bars.push({
        position: "absolute",
        width: ICON_BAR,
        height: ICON_EDGE,
        top: (ICON - ICON_EDGE) / 2,
        ...hEdge,
      });
    } else {
      // corner — an L-bracket (a horizontal arm + a vertical arm) at (x,y)
      bars.push({ position: "absolute", width: ICON_ARM, height: ICON_BAR, ...vEdge, ...hEdge });
      bars.push({ position: "absolute", width: ICON_BAR, height: ICON_ARM, ...vEdge, ...hEdge });
    }
  }

  return (
    <View testID={`spot-icon-${spot}`} accessible={false} style={styles.box}>
      {bars.map((b, i) => (
        <View key={i} style={[b, styles.bar]} />
      ))}
      <View style={styles.ring} />
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    width: ICON,
    height: ICON,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    backgroundColor: colors.textMuted,
    borderRadius: 1,
  },
  ring: {
    width: ICON_RING,
    height: ICON_RING,
    borderRadius: ICON_RING / 2,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
});
