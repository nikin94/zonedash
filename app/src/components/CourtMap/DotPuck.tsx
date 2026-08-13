import { Animated, StyleSheet, View } from "react-native";

import { DOT, type SpotVisual } from "../../helpers/court";
import { colors } from "../../theme";
import {
  DotGlyphs,
  dotBase,
  toneOf,
  useCrossFade,
  type Tone,
} from "./dotShared";

/**
 * Restyle variant B — "elevated puck": a single filled disc lifted off the
 * court with a soft drop shadow, so it reads as a physical button rather than a
 * flat mark. A prompted / lit spot fills with the accent AND casts a coloured
 * glow (its own shadow tinted), so "react now" pops without changing size; bound
 * / hit glow emerald. Least structural change, most "expensive"-looking.
 */
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

export const DotPuck = ({ visual }: { visual: SpotVisual }) => {
  const { from, to, overlay } = useCrossFade(visual);
  const now = LOOK[toneOf(to)];
  const prev = LOOK[toneOf(from)];
  return (
    <View
      testID="dot-puck"
      style={[
        styles.puck,
        glowOf(toneOf(to)),
        { backgroundColor: now.fill, borderColor: now.border },
      ]}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: prev.fill,
            borderColor: prev.border,
            opacity: overlay,
          },
        ]}
      />
      <DotGlyphs visual={visual} />
    </View>
  );
};

const styles = StyleSheet.create({
  puck: {
    ...dotBase,
    borderWidth: 1.5,
  },
  // The old-colour layer covers the base including its border (-1 offsets), then
  // fades out to reveal the new colour underneath.
  overlay: {
    position: "absolute",
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: DOT / 2 + 1,
    borderWidth: 1.5,
  },
});
