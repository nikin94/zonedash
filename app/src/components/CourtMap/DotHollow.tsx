import { Animated, StyleSheet, View } from "react-native";

import { DOT, type SpotVisual } from "../../helpers/court";
import { alpha, colors } from "../../theme";
import {
  DotGlyphs,
  dotBase,
  toneOf,
  useCrossFade,
  type Tone,
} from "./dotShared";

/**
 * Restyle variant C — "hollow → filled": an idle spot is an outlined ring (a
 * thick stroke over a faint tinted backdrop kept for glare legibility), and a
 * prompted / lit / bound spot FILLS solid with its colour. The most minimal,
 * modern read — empty vs. full is the whole language — and it kills the flat
 * grey blin outright.
 */
type Look = { fill: string; border: string };

const LOOK: Record<Tone, Look> = {
  empty: { fill: alpha(colors.border, 0), border: alpha(colors.border, 0.45) },
  idle: { fill: alpha(colors.border, 0.1), border: colors.border },
  accent: { fill: colors.accent, border: colors.accent },
  warning: { fill: colors.warning, border: colors.warning },
  success: { fill: colors.success, border: colors.success },
};

const Ring = ({ tone }: { tone: Tone }) => {
  const look = LOOK[tone];
  return (
    <View
      style={[
        styles.ring,
        { backgroundColor: look.fill, borderColor: look.border },
      ]}
    />
  );
};

export const DotHollow = ({ visual }: { visual: SpotVisual }) => {
  const { from, to, overlay } = useCrossFade(visual);
  return (
    <View style={dotBase} testID="dot-hollow">
      <Ring tone={toneOf(to)} />
      <Animated.View style={[styles.overlay, { opacity: overlay }]}>
        <Ring tone={toneOf(from)} />
      </Animated.View>
      <DotGlyphs visual={visual} />
    </View>
  );
};

const styles = StyleSheet.create({
  ring: {
    ...dotBase,
    borderWidth: 2.5, // thick stroke so the hollow idle stays legible under glare
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
