import { StyleSheet, View } from "react-native";

import { colors } from "../theme";

/**
 * Minimal hand-drawn icons (pure Views, no icon font / emoji glyphs — those
 * render differently per platform). Sized for the 44 px header buttons.
 */

const W = 18;
const KNOB = 6;

/** Three slider tracks with offset knobs — the settings affordance. */
export const SlidersIcon = () => (
  <View style={styles.slidersBox} accessible={false}>
    {[0.15, 0.7, 0.4].map((x, i) => (
      <View key={i} style={styles.track}>
        <View style={[styles.knob, { left: x * (W - KNOB) }]} />
      </View>
    ))}
  </View>
);

/** A thin ✕ built from two rotated bars. */
export const CloseIcon = () => (
  <View style={styles.closeBox} accessible={false}>
    <View style={[styles.closeBar, styles.closeBarA]} />
    <View style={[styles.closeBar, styles.closeBarB]} />
  </View>
);

/** A ‹ chevron built from two rotated bars — the header back affordance. */
export const BackIcon = () => (
  <View style={styles.backBox} accessible={false}>
    <View style={[styles.backBar, styles.backBarA]} />
    <View style={[styles.backBar, styles.backBarB]} />
  </View>
);

/** A ✓ built from two rotated bars — sized for the 38 px court dots. */
export const CheckIcon = () => (
  <View style={styles.checkBox} accessible={false}>
    <View style={[styles.checkBar, styles.checkBarShort]} />
    <View style={[styles.checkBar, styles.checkBarLong]} />
  </View>
);

const styles = StyleSheet.create({
  slidersBox: {
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
  closeBox: {
    width: W,
    height: W,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBar: {
    position: "absolute",
    width: W,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
  },
  closeBarA: {
    transform: [{ rotate: "45deg" }],
  },
  closeBarB: {
    transform: [{ rotate: "-45deg" }],
  },
  backBox: {
    width: W,
    height: W,
    alignItems: "center",
    justifyContent: "center",
  },
  backBar: {
    position: "absolute",
    width: 11,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
    left: 3,
  },
  backBarA: {
    top: 5,
    transform: [{ rotate: "-45deg" }],
  },
  backBarB: {
    bottom: 5,
    transform: [{ rotate: "45deg" }],
  },
  checkBox: {
    width: 16,
    height: 16,
  },
  checkBar: {
    position: "absolute",
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: colors.background, // page color on the emerald bound fill
  },
  checkBarShort: {
    width: 7,
    left: 0.5,
    top: 9,
    transform: [{ rotate: "45deg" }],
  },
  checkBarLong: {
    width: 12,
    left: 4,
    top: 7.5,
    transform: [{ rotate: "-45deg" }],
  },
});
