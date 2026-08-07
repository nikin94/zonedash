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
import { RotateIcon } from "../Icons";
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
 *
 * `flipped` rotates the VIEW 180° (the operator standing at the other end of
 * the hall): each dot is drawn at its mirrored position and the NET label moves
 * to the bottom, but the reported spot index is unchanged — orientation is a
 * display transform, never a spot-identity one. `onToggleFlip`, when given,
 * renders a small rotate control in the court's top corner.
 */
export const CourtMap = ({
  spots,
  onPressSpot,
  children,
  flipped = false,
  onToggleFlip,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
  children?: ReactNode;
  flipped?: boolean;
  onToggleFlip?: () => void;
}) => {
  const net = (
    <View style={styles.netRow}>
      <View style={styles.netLine} />
      <AppText size={10} color={colors.textMuted} style={styles.netLabel}>
        NET
      </AppText>
      <View style={styles.netLine} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      {/* Two fixed-height strips frame the court so the layout (and the rotate
          control's clear corner) never shifts. NET sits in the top strip by
          default; a flip moves the whole view — and the net with it — to read
          from the operator's new vantage. */}
      <View style={styles.strip}>{!flipped && net}</View>
      <View style={styles.court}>
        {children != null && (
          // box-none: the centre content is interactive, the empty area around
          // it stays transparent to touches so the perimeter spots keep working.
          <View pointerEvents="box-none" style={styles.centre}>
            {children}
          </View>
        )}
        {SPOT_XY.map((p, i) => {
          // A flip mirrors the drawn position only — dot `i` still reports spot
          // `i`, so the wire/identity is untouched.
          const x = flipped ? 1 - p.x : p.x;
          const y = flipped ? 1 - p.y : p.y;
          return (
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
                  left: INSET + x * (MAP_W - HIT - 2 * INSET),
                  top: INSET + y * (MAP_H - HIT - 2 * INSET),
                },
              ]}
            >
              <AnimatedDot visual={spots[i]} />
            </CustomPressable>
          );
        })}
      </View>
      <View style={styles.strip}>{flipped && net}</View>

      {onToggleFlip && (
        <CustomPressable
          testID="court-rotate"
          accessibilityLabel="Rotate the court view"
          accessibilityState={{ selected: flipped }}
          onPress={onToggleFlip}
          style={styles.rotate}
        >
          <RotateIcon />
        </CustomPressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  // Equal top/bottom strips: one carries the NET label, the other is an empty
  // mirror, so the court never shifts vertically on a flip and the rotate
  // control keeps a clear corner in both orientations.
  strip: {
    height: 22,
    width: MAP_W,
    justifyContent: "center",
  },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  // Small control tucked into the court block's top-right corner (all four
  // court corners hold dots, so it sits in the net strip beside them). A page
  // fill + border lift it off the lines; it doesn't move with a flip — it's a
  // control, not court content.
  rotate: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
