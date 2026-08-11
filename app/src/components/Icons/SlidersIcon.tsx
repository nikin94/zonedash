import { StyleSheet, View } from "react-native";

import { colors } from "../../theme";

const W = 18;
const KNOB = 6;

/**
 * Three slider tracks with offset knobs — the settings affordance. Pure Views,
 * no icon font / emoji glyphs (those render differently per platform). `color`
 * tints the tracks + knob rings so the Settings tab can go accent when focused;
 * defaults to muted.
 */
export const SlidersIcon = ({
  color = colors.textMuted,
}: {
  color?: string;
} = {}) => (
  <View style={styles.box} accessible={false}>
    {[0.15, 0.7, 0.4].map((x, i) => (
      <View key={i} style={[styles.track, { backgroundColor: color }]}>
        <View
          style={[styles.knob, { left: x * (W - KNOB), borderColor: color }]}
        />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  box: {
    width: W,
    gap: 4,
  },
  track: {
    width: W,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
    justifyContent: "center",
  },
  // Page fill + outline matching the tracks, so the knob reads as a ring in
  // the same tone as the rest of the icon.
  knob: {
    position: "absolute",
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: colors.background,
  },
});
