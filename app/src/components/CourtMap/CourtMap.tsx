import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { SPOT_NAMES, SPOT_XY } from "../../domain/spot";
import {
  CENTRE_PAD,
  HIT,
  HIT_SLOP,
  INSET,
  MAP_H,
  MAP_W,
  type SpotVisual,
} from "../../helpers/court";
import { colors } from "../../theme";
import { AppText } from "../AppText";
import { CustomPressable } from "../CustomPressable";
import { AnimatedDot } from "./AnimatedDot";

// Screen-reader wording per state — the label must carry it, since fill and
// glyph are the only visual differentiators between the states.
const A11Y_STATE: Record<SpotVisual, string> = {
  off: "empty",
  available: "available",
  pulse: "tap to place a target here",
  active: "press here",
  armed: "target lit, react",
  confirm: "awaiting confirm",
  bound: "bound",
  selected: "selected",
  hit: "hit",
};

/**
 * Half-court map. Pure renderer: the parent supplies each canonical spot's
 * visual state; taps (when enabled) report the canonical spot index.
 * `children` render centered inside the court — the perimeter is all dots, so
 * the middle is free real estate for the round's status text and action.
 */
export const CourtMap = ({
  spots,
  onPressSpot,
  children,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
  children?: ReactNode;
}) => (
  <View style={styles.wrap}>
    <View style={styles.netRow}>
      <View style={styles.netLine} />
      <AppText size={10} color={colors.textMuted} style={styles.netLabel}>
        NET
      </AppText>
      <View style={styles.netLine} />
    </View>
    <View style={styles.court}>
      {children != null && (
        // box-none: the centre content is interactive, the empty area around
        // it stays transparent to touches so the perimeter spots keep working.
        <View pointerEvents="box-none" style={styles.centre}>
          {children}
        </View>
      )}
      {SPOT_XY.map((p, i) => (
        <CustomPressable
          key={i}
          noFeedback
          disabled={!onPressSpot}
          hitSlop={HIT_SLOP}
          testID={`spot-${i}-${spots[i]}`}
          accessibilityLabel={`${SPOT_NAMES[i]} spot, ${A11Y_STATE[spots[i]]}`}
          accessibilityState={{ disabled: !onPressSpot, selected: spots[i] !== "off" }}
          onPress={() => onPressSpot?.(i)}
          style={[
            styles.hit,
            {
              left: INSET + p.x * (MAP_W - HIT - 2 * INSET),
              top: INSET + p.y * (MAP_H - HIT - 2 * INSET),
            },
          ]}
        >
          <AnimatedDot visual={spots[i]} />
        </CustomPressable>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  netRow: {
    width: MAP_W,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  netLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
  },
  netLabel: {
    letterSpacing: 2,
  },
  court: {
    width: MAP_W,
    height: MAP_H,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  centre: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    // A deliberately narrow info/controls column (see CENTRE_PAD): it clears
    // the perimeter dots' hit boxes with room to spare, leaving the freed
    // space to the bigger, further-inset targets.
    padding: CENTRE_PAD,
  },
  hit: {
    position: "absolute",
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
  },
});
