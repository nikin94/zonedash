import { memo, useLayoutEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { DOT, type SpotVisual } from "../../helpers/court";
import { colors } from "../../theme";
import { CheckIcon } from "../Icons";
import { RadarPing } from "./RadarPing";

/**
 * One court dot — an "elevated puck": a single filled disc lifted off the court
 * with a soft drop shadow, so it reads as a physical button rather than a flat
 * grey mark. A prompted / lit spot fills with the accent AND casts a coloured
 * glow (its own shadow tinted), so "react now" pops without changing size;
 * bound / hit glow emerald with a check.
 *
 * The disc colours cross-fade on every state change instead of snapping: the
 * base View wears the NEW state's colours and an overlay wears the OLD state's
 * and fades its opacity 1→0 on the native driver — no colour interpolation, so
 * the commit frame is pixel-identical to the previous one (no flash) and the
 * fade runs on the UI thread regardless of JS load.
 *
 * The base View IS the disc (not a child), so the only in-flow child is the
 * state glyph (the check) — it stays centred when it appears, never shoving the
 * disc aside. The radar ping is absolutely positioned, so it never affects
 * layout either. Size is constant across every state (the emphasis is
 * colour/glow, not scale), so a spot is equally easy to hit lit or idle.
 *
 * memo: the panel re-renders on every Status event (prompt, confirm, session);
 * a dot re-renders only when ITS visual actually changes.
 */
const FADE_MS = 200;

/** The semantic tone a visual state carries — colour + glow follow from it. */
type Tone = "empty" | "idle" | "accent" | "warning" | "success";

const TONE: Record<SpotVisual, Tone> = {
  off: "empty",
  available: "idle",
  pulse: "idle", // the breathing ping marks it "tap here", not the fill
  active: "accent",
  armed: "accent",
  confirm: "warning",
  bound: "success",
  selected: "accent",
  hit: "success",
};

type Look = { fill: string; border: string; glow: string };

const LOOK: Record<Tone, Look> = {
  empty: {
    fill: colors.background,
    border: colors.border,
    glow: colors.shadow,
  },
  idle: { fill: colors.surface, border: colors.border, glow: colors.shadow },
  accent: { fill: colors.accent, border: colors.accent, glow: colors.accent },
  warning: {
    fill: colors.warning,
    border: colors.warning,
    glow: colors.warning,
  },
  success: {
    fill: colors.success,
    border: colors.success,
    glow: colors.success,
  },
};

// A neutral tone rests with a faint grey shadow; a coloured tone lifts with a
// stronger tinted glow so the accent/emerald spot reads as raised and lit.
const glowOf = (tone: Tone) => {
  const colored = tone === "accent" || tone === "warning" || tone === "success";
  return {
    shadowColor: LOOK[tone].glow,
    shadowOpacity: colored ? 0.55 : 0.18,
    shadowRadius: colored ? 7 : 4,
    shadowOffset: { width: 0, height: colored ? 0 : 2 },
    elevation: colored ? 8 : 3,
  };
};

export const AnimatedDot = memo(({ visual }: { visual: SpotVisual }) => {
  const fromRef = useRef(visual);
  const toRef = useRef(visual);
  const overlayRef = useRef(new Animated.Value(0));

  // Detect the change during render. A FRESH value born at 1 attaches with this
  // commit, so the first painted frame shows the old colour at full strength —
  // pixel-identical to the previous frame, so no flash is possible.
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

  const now = LOOK[TONE[toRef.current]];
  const prev = LOOK[TONE[fromRef.current]];
  return (
    <View
      testID="dot-puck"
      style={[
        styles.puck,
        glowOf(TONE[toRef.current]),
        { backgroundColor: now.fill, borderColor: now.border },
      ]}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: prev.fill,
            borderColor: prev.border,
            opacity: overlayRef.current,
          },
        ]}
      />
      {/* Glyphs sit above the fade overlay so they appear with the new state:
          an accent radar ping on the prompted pairing spot (active/confirm) and
          on a lit exercise target (armed) — "react now"; a soft muted breath on
          the other unbound pairing spots (pulse — "tap here"); a check on
          bound/hit. */}
      {(toRef.current === "active" ||
        toRef.current === "confirm" ||
        toRef.current === "armed") && <RadarPing />}
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
  // One size for every state; the border is always present (colour changes per
  // state, so "off" cross-fades too). A thick 2.5 px stroke keeps the disc's
  // edge legible under glare. Centres the state glyph (the check).
  puck: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dotGlyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  // The old-colour layer covers the base including its border (-1 offsets, so
  // its diameter is DOT + 2 and its radius matches), then fades out to reveal
  // the new colour underneath.
  overlay: {
    position: "absolute",
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: DOT / 2 + 1,
    borderWidth: 2.5,
  },
});
