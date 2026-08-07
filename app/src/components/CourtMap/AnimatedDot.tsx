import { memo, useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, View } from "react-native";

import { DOT, type SpotVisual } from "../../helpers/court";
import { alpha, colors } from "../../theme";
import { CheckIcon } from "../Icons";
import { RadarPing } from "./RadarPing";

// Fill + outline per state. "off" fades to a zero-alpha fill (outline only)
// instead of snapping away. "active" (pairing) is a neutral surface fill under
// a spinner — it means "loading". "armed" (a lit exercise target) is a bright
// accent fill under a radar ping — it means "react now", never a spinner.
const DOT_STYLE: Record<SpotVisual, { fill: string; ring: string }> = {
  off: { fill: alpha(colors.border, 0), ring: colors.border },
  available: { fill: colors.dim, ring: alpha(colors.border, 0) },
  // Same resting fill as "available" — the breathing ring (below) is what sets
  // a pulsing pairing spot apart, so it reads as "tap here" while binding.
  pulse: { fill: colors.dim, ring: alpha(colors.border, 0) },
  active: { fill: colors.surface, ring: colors.border },
  armed: { fill: colors.accent, ring: alpha(colors.border, 0) },
  confirm: { fill: colors.warning, ring: alpha(colors.border, 0) },
  bound: { fill: colors.success, ring: alpha(colors.border, 0) },
  selected: { fill: colors.accent, ring: alpha(colors.border, 0) },
  hit: { fill: colors.success, ring: alpha(colors.border, 0) },
};

const FADE_MS = 200;

/**
 * One court dot, cross-fading on every state change instead of snapping.
 * Two statically-colored layers: the base wears the NEW state's colors, an
 * overlay wears the OLD state's and fades its opacity 1→0 on the native
 * driver. No color interpolation at all — the previous approach reset a
 * JS-driven color fade in a layout effect, and when all 8 dots changed at
 * once (Start pairing) that reset could slip past a frame under JS load:
 * a flash of the new color, a snap back, then the fade — read as a double
 * blink. With static layers the commit frame is pixel-identical to the
 * previous one (old color at full opacity), so no flash is possible, and
 * the opacity fade runs on the UI thread regardless of JS load.
 *
 * memo: the panel re-renders on every Status event (prompt, confirm,
 * session); a dot re-renders only when ITS visual actually changes.
 */
export const AnimatedDot = memo(({ visual }: { visual: SpotVisual }) => {
  const fromRef = useRef(visual);
  const toRef = useRef(visual);
  const overlayRef = useRef(new Animated.Value(0));

  // Detect the change during render. A FRESH value born at 1 (instead of
  // setValue on the live one, which would force-update the Animated view
  // mid-render) attaches with this commit — the first painted frame shows the
  // old color at full strength, so it matches the previous frame exactly.
  if (visual !== toRef.current) {
    fromRef.current = toRef.current;
    toRef.current = visual;
    overlayRef.current = new Animated.Value(1);
  }

  useLayoutEffect(() => {
    if (fromRef.current === toRef.current) return;
    const overlay = overlayRef.current;
    Animated.timing(overlay, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true, // opacity-only — off the JS thread entirely
    }).start(({ finished }) => {
      // Settle so a later unrelated effect run can't replay this fade; a
      // superseded fade (its value already swapped out) must not settle.
      if (finished && overlayRef.current === overlay) {
        fromRef.current = toRef.current;
      }
    });
  }, [visual]);

  const from = DOT_STYLE[fromRef.current];
  const to = DOT_STYLE[toRef.current];
  return (
    <View style={[styles.dot, { backgroundColor: to.fill, borderColor: to.ring }]}>
      <Animated.View
        style={[
          styles.dotOverlay,
          {
            backgroundColor: from.fill,
            borderColor: from.ring,
            opacity: overlayRef.current,
          },
        ]}
      />
      {/* Glyphs sit above the fade overlay so they appear with the new state:
          a spinner while a pairing spot is prompted (loading), a radar ping on
          a lit exercise target (react now), a check on bound/hit. */}
      {toRef.current === "active" && (
        <ActivityIndicator testID="dot-spinner" size="small" color={colors.text} />
      )}
      {toRef.current === "armed" && <RadarPing />}
      {toRef.current === "pulse" && <RadarPing color={colors.textMuted} />}
      {(toRef.current === "bound" || toRef.current === "hit") && (
        <View testID="dot-check" style={styles.dotGlyph}>
          <CheckIcon />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // One size for every state — the active/confirm emphasis is color, not
  // scale, so idle and bound spots are just as easy to hit. The border is
  // always present with a per-state color, so "off" cross-fades too. Centers
  // the state glyph (spinner / check).
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dotGlyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  // The old-color layer covers the base including its border (-1 offsets, so
  // its diameter is DOT + 2 and its radius must match — a hardcoded radius
  // here once lagged a dot resize and drew as a rounded square mid-fade),
  // then fades out to reveal the new color underneath.
  dotOverlay: {
    position: "absolute",
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: DOT / 2 + 1,
    borderWidth: 1,
  },
});
