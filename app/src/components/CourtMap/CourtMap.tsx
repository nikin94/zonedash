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

const STRIP_H = 22; // top/bottom net-line strip
const ICON_BOX = 20; // rotate control's touch box
// The rotate control sits diagonally OUT from the court's top-right corner, an
// equal gap in x and y — clear of both the corner dot and the (now full) net
// line, so nothing overlaps.
const ICON_OUT = 10;

/** Rotate a normalised (x, y) by `r` clockwise quarter turns. One turn maps
 *  (x, y) → (1 − y, x); the 8 perimeter spots stay on the perimeter, so a dot
 *  keeps its identity while its drawn position turns with the view. */
const rotate = (x: number, y: number, r: number) => {
  let rx = x;
  let ry = y;
  for (let k = 0; k < (((r % 4) + 4) % 4); k++) {
    const nx = 1 - ry;
    const ny = rx;
    rx = nx;
    ry = ny;
  }
  return { x: rx, y: ry };
};

// Which court edge the NET sits on per rotation — the top row of spots turns
// clockwise with the view: top → right → bottom → left.
const NET_EDGE = ["top", "right", "bottom", "left"] as const;

/**
 * Half-court map. Pure renderer: the parent supplies each canonical spot's
 * visual state; taps (when enabled) report the canonical spot index.
 * `children` render centered inside the court — the perimeter is all dots, so
 * the middle is free real estate for the round's status text and action.
 *
 * `rotation` turns the VIEW in clockwise quarter turns (0–3) — the operator
 * moving around the hall. Each dot is drawn at its rotated position and the NET
 * label tracks to the matching edge, but the reported spot index is unchanged:
 * orientation is a display transform, never a spot-identity one. `onRotate`,
 * when given, renders a small rotate control in the court's top-right corner.
 */
export const CourtMap = ({
  spots,
  onPressSpot,
  children,
  rotation = 0,
  onRotate,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
  children?: ReactNode;
  rotation?: number;
  onRotate?: () => void;
}) => {
  const r = (((rotation % 4) + 4) % 4);
  const edge = NET_EDGE[r];

  // Horizontal net (line ─ NET ─ line) for the top/bottom edges — a full line
  // both ways; the rotate control sits out past the corner, so nothing to clear.
  const hNet = (
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
      {/* Two fixed-height strips frame the court so the layout — and the rotate
          control's level — never shift. NET occupies the strip on its current
          edge; the side edges get a small rotated label in the margin. */}
      <View style={styles.strip}>{edge === "top" && hNet}</View>

      <View style={styles.courtWrap}>
        {edge === "left" && (
          <AppText
            size={10}
            color={colors.textMuted}
            style={[styles.sideNet, styles.sideNetLeft]}
          >
            NET
          </AppText>
        )}
        {edge === "right" && (
          <AppText
            size={10}
            color={colors.textMuted}
            style={[styles.sideNet, styles.sideNetRight]}
          >
            NET
          </AppText>
        )}
        <View style={styles.court}>
          {children != null && (
            // box-none: the centre content is interactive, the empty area around
            // it stays transparent to touches so the perimeter spots keep working.
            <View pointerEvents="box-none" style={styles.centre}>
              {children}
            </View>
          )}
          {SPOT_XY.map((p, i) => {
            // Rotation moves the drawn position only — dot `i` still reports spot
            // `i`, so the wire/identity is untouched.
            const { x, y } = rotate(p.x, p.y, r);
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
      </View>

      <View style={styles.strip}>{edge === "bottom" && hNet}</View>

      {onRotate && (
        <CustomPressable
          noFeedback
          hitSlop={10}
          testID="court-rotate"
          accessibilityLabel="Rotate the court view"
          accessibilityState={{ selected: r !== 0 }}
          onPress={onRotate}
          style={styles.rotate}
        >
          <RotateIcon size={14} color={colors.border} />
        </CustomPressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  // Equal top/bottom strips: whichever holds the NET line, the court never
  // shifts vertically as the view rotates, and the rotate control keeps a
  // fixed level.
  strip: {
    height: STRIP_H,
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
  courtWrap: {
    width: MAP_W,
  },
  // Small rotated NET label sitting just off a side edge (overflows into the
  // screen margin the centred court leaves free), for the 90°/270° views.
  sideNet: {
    position: "absolute",
    top: MAP_H / 2 - 8,
    letterSpacing: 2,
    transform: [{ rotate: "-90deg" }],
  },
  sideNetLeft: {
    left: -20,
  },
  sideNetRight: {
    right: -20,
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
  // Bare icon (no outline/fill), same colour as the net line, carried
  // diagonally OUT from the court's top-right corner — an equal gap up and
  // right (see ICON_OUT), so it clears the corner dot and the full net line.
  // Corner is at (top: STRIP_H, right edge); centre lands ICON_OUT beyond it
  // on both axes. It's a control, so it never moves with the view.
  rotate: {
    position: "absolute",
    top: STRIP_H - ICON_OUT - ICON_BOX / 2,
    right: -(ICON_OUT + ICON_BOX / 2),
    height: ICON_BOX,
    width: ICON_BOX,
    alignItems: "center",
    justifyContent: "center",
  },
});
