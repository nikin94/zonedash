import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { DOT, HIT, INSET, MAP_H, MAP_W } from "../../helpers/court";
import { formatSeconds } from "../../helpers/time";
import { colors } from "../../theme";
import { AppText } from "../AppText";

// Fade-in, hold, fade-out — the callout shows the reaction time by the target
// for ~0.5 s, then fades over ~0.3 s (spec). Opacity-only, native-driven, so it
// never touches the JS thread while a fast series of hits stacks callouts.
const IN_MS = 140;
const HOLD_MS = 500;
const OUT_MS = 300;

const THICK = 1.5; // leader-line stroke
const GAP = DOT / 2 + 4; // start the diagonal just off the dot edge, not its centre
const DIAG = 20; // diagonal run (equal x/y → 45°)
const UNDER = 46; // horizontal underline length (fits "0.42s")
const NUM_H = 16; // reserved height for the number above the underline
const INV_SQRT2 = 0.7071067811865476;

export interface CalloutGeometry {
  /** Which way the leader points, toward the open court interior (±1). */
  sx: number;
  sy: number;
  /** The diagonal segment (a thin View rotated to `angle` degrees). */
  diag: { left: number; top: number; width: number; angle: number };
  /** The horizontal underline segment under the number. */
  under: { left: number; top: number; width: number };
  /** The number box, centred over the underline, sitting just above it. */
  num: { left: number; top: number; width: number };
}

/**
 * Pure leader-line geometry for a target at the (already-rotated) normalised
 * position (x, y), in the court container's coordinate space — the same space
 * the dots are laid out in (INSET / HIT / MAP_*). A two-segment callout: a 45°
 * diagonal out of the target, then a horizontal underline under the reaction
 * time. It points toward the court INTERIOR (left half → right, top half →
 * down, and mirrored), so an edge target's callout never runs off the court.
 */
export const calloutGeometry = (x: number, y: number): CalloutGeometry => {
  // The dot's centre: its hit box sits at INSET + x·(span), and the dot is
  // centred in that HIT box.
  const cx = INSET + x * (MAP_W - HIT - 2 * INSET) + HIT / 2;
  const cy = INSET + y * (MAP_H - HIT - 2 * INSET) + HIT / 2;
  // Lead into the open interior so an edge target's callout stays on the court.
  const sx = x < 0.5 ? 1 : -1;
  const sy = y < 0.5 ? 1 : -1;

  // Diagonal: from just off the dot edge to its end point.
  const startX = cx + sx * GAP * INV_SQRT2;
  const startY = cy + sy * GAP * INV_SQRT2;
  const endX = startX + sx * DIAG;
  const endY = startY + sy * DIAG;
  const width = Math.hypot(endX - startX, endY - startY);
  const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  // Underline runs horizontally from the diagonal's end; the number rides above.
  const underLeft = sx > 0 ? endX : endX - UNDER;
  return {
    sx,
    sy,
    diag: {
      left: midX - width / 2,
      top: midY - THICK / 2,
      width,
      angle,
    },
    under: { left: underLeft, top: endY - THICK / 2, width: UNDER },
    num: { left: underLeft, top: endY - NUM_H - 2, width: UNDER },
  };
};

/**
 * A single reaction-time callout by a just-hit target: a two-segment leader line
 * (a 45° diagonal off the target into an underline) with the reaction time above
 * it. Fades in, holds ~0.5 s, fades out ~0.3 s, then calls `onDone` so the owner
 * can prune it. Absolutely positioned over the court and non-interactive, so a
 * fast series of hits simply stacks independent callouts that each fade on their
 * own clock without ever blocking a tap or the next arm.
 */
export const ReactionCallout = ({
  x,
  y,
  reactionMs,
  onDone,
}: {
  x: number;
  y: number;
  reactionMs: number;
  onDone: () => void;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const g = useMemo(() => calloutGeometry(x, y), [x, y]);
  // Latest onDone without re-running the one-shot animation on every re-render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: IN_MS,
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: OUT_MS,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => anim.stop();
    // Run once — the callout is born for one show/fade, then pruned by onDone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      testID="reaction-callout"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <View
        style={[
          styles.line,
          {
            left: g.diag.left,
            top: g.diag.top,
            width: g.diag.width,
            transform: [{ rotate: `${g.diag.angle}deg` }],
          },
        ]}
      />
      <View
        style={[
          styles.line,
          { left: g.under.left, top: g.under.top, width: g.under.width },
        ]}
      />
      <View
        style={[
          styles.numBox,
          { left: g.num.left, top: g.num.top, width: g.num.width },
        ]}
      >
        <AppText size={13} weight="700" color={colors.success}>
          {formatSeconds(reactionMs)}
        </AppText>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  line: {
    position: "absolute",
    height: THICK,
    borderRadius: THICK / 2,
    backgroundColor: colors.success,
  },
  numBox: {
    position: "absolute",
    height: NUM_H,
    alignItems: "center",
    justifyContent: "flex-end",
  },
});
