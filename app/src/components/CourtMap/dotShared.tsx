import { useLayoutEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { DOT, type SpotVisual } from "../../helpers/court";
import { colors } from "../../theme";
import { CheckIcon } from "../Icons";
import { RadarPing } from "./RadarPing";

/**
 * Shared machinery for the three dot restyle variants (DotBullseye / DotPuck /
 * DotHollow), so they differ ONLY in look — the cross-fade behaviour and the
 * state glyphs (radar ping / check) are identical, and the court tests that pin
 * "exactly one native-driven fade per state change" and the ping/check glyphs
 * hold whichever variant a spot draws.
 *
 * This file exists to make the A/B/C comparison a clean swap: once a winner is
 * picked, delete the two losing variant files and this shared shell folds back
 * into the winner. Nothing here is variant-specific beyond the `Tone` mapping,
 * which every variant reads to colour its own shape.
 */
export const FADE_MS = 200;

/** The semantic tone a visual state carries — each variant maps it to its own
 *  shape/colour, so "what a state means" stays in one place. */
export type Tone = "empty" | "idle" | "accent" | "warning" | "success";

const TONE: Record<SpotVisual, Tone> = {
  off: "empty",
  available: "idle",
  pulse: "idle", // the breathing ping (below) is what marks it "tap here"
  active: "accent",
  armed: "accent",
  confirm: "warning",
  bound: "success",
  selected: "accent",
  hit: "success",
};

export const toneOf = (v: SpotVisual): Tone => TONE[v];

/**
 * Cross-fade state: hold the FROM (old) and TO (new) visual plus an overlay
 * opacity that fades 1→0 on the native driver whenever the visual changes. A
 * fresh Animated.Value born at 1 attaches with the same commit as the new
 * colours, so the first painted frame matches the previous one exactly (no
 * flash), and the fade runs off the JS thread. Exactly ONE Animated.timing per
 * real change; a re-render with an unchanged visual starts nothing (the guard).
 */
export const useCrossFade = (visual: SpotVisual) => {
  const fromRef = useRef(visual);
  const toRef = useRef(visual);
  const overlayRef = useRef(new Animated.Value(0));

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
      if (finished && overlayRef.current === overlay) {
        fromRef.current = toRef.current;
      }
    });
  }, [visual]);

  return {
    from: fromRef.current,
    to: toRef.current,
    overlay: overlayRef.current,
  };
};

/**
 * The state glyphs every variant paints above its fade — kept in one place so
 * the tested behaviour never diverges between variants: an accent radar ping on
 * the prompted / lit spots ("react now"), a soft muted breath on an unbound
 * pairing spot ("tap here"), and a check on a bound / hit spot.
 */
export const DotGlyphs = ({ visual }: { visual: SpotVisual }) => (
  <>
    {(visual === "active" || visual === "confirm" || visual === "armed") && (
      <RadarPing />
    )}
    {visual === "pulse" && <RadarPing color={colors.textMuted} />}
    {(visual === "bound" || visual === "hit") && (
      <View testID="dot-check" style={styles.glyph}>
        <CheckIcon />
      </View>
    )}
  </>
);

/** The 44 px circular footprint every variant shares (one size for every state
 *  — the emphasis is colour/shape, not scale, so idle and lit spots are equally
 *  easy to hit). Centres the state glyph. */
export const dotBase = {
  width: DOT,
  height: DOT,
  borderRadius: DOT / 2,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const styles = StyleSheet.create({
  glyph: {
    alignItems: "center",
    justifyContent: "center",
  },
});
