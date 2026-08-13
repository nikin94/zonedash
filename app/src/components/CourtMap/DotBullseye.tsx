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
 * Restyle variant A — "bullseye": a concentric target, an outer ring around a
 * filled core. Idle reads as a target (light ring + grey core) instead of a
 * flat grey blin, giving depth without gradients; a prompted / lit spot floods
 * the core with the accent, bound / hit go emerald with a check. Thematic for a
 * reaction trainer and keeps the full 44 px hit area under glare.
 */
type Look = { outer: string; border: string; core: string };

const LOOK: Record<Tone, Look> = {
  empty: {
    outer: alpha(colors.border, 0),
    border: alpha(colors.border, 0.5),
    core: alpha(colors.border, 0),
  },
  idle: { outer: colors.surface, border: colors.border, core: colors.border },
  accent: {
    outer: colors.accentSurface,
    border: colors.accent,
    core: colors.accent,
  },
  warning: {
    outer: alpha(colors.warning, 0.12),
    border: colors.warning,
    core: colors.warning,
  },
  success: {
    outer: alpha(colors.success, 0.12),
    border: colors.success,
    core: colors.success,
  },
};

const Bullseye = ({ tone }: { tone: Tone }) => {
  const look = LOOK[tone];
  return (
    <View
      style={[
        styles.ring,
        { backgroundColor: look.outer, borderColor: look.border },
      ]}
    >
      <View style={[styles.core, { backgroundColor: look.core }]} />
    </View>
  );
};

export const DotBullseye = ({ visual }: { visual: SpotVisual }) => {
  const { from, to, overlay } = useCrossFade(visual);
  return (
    <View style={dotBase} testID="dot-bullseye">
      <Bullseye tone={toneOf(to)} />
      <Animated.View style={[styles.overlay, { opacity: overlay }]}>
        <Bullseye tone={toneOf(from)} />
      </Animated.View>
      <DotGlyphs visual={visual} />
    </View>
  );
};

const CORE = Math.round(DOT * 0.5); // filled centre — big enough for the check

const styles = StyleSheet.create({
  ring: {
    ...dotBase,
    borderWidth: 2,
  },
  core: {
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
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
