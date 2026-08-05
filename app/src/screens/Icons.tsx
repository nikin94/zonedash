import { StyleSheet, View } from "react-native";

/**
 * Minimal hand-drawn icons (pure Views, no icon font / emoji glyphs — those
 * render differently per platform). Sized for the 44 px header buttons.
 */

const W = 18;
const KNOB = 6;

/** Three slider tracks with offset knobs — the settings affordance. */
export function SlidersIcon() {
  return (
    <View style={styles.slidersBox} accessible={false}>
      {[0.15, 0.7, 0.4].map((x, i) => (
        <View key={i} style={styles.track}>
          <View style={[styles.knob, { left: x * (W - KNOB) }]} />
        </View>
      ))}
    </View>
  );
}

/** A thin ✕ built from two rotated bars. */
export function CloseIcon() {
  return (
    <View style={styles.closeBox} accessible={false}>
      <View style={[styles.closeBar, styles.closeBarA]} />
      <View style={[styles.closeBar, styles.closeBarB]} />
    </View>
  );
}

/** A ✓ built from two rotated bars — sized for the 38 px court dots. */
export function CheckIcon() {
  return (
    <View style={styles.checkBox} accessible={false}>
      <View style={[styles.checkBar, styles.checkBarShort]} />
      <View style={[styles.checkBar, styles.checkBarLong]} />
    </View>
  );
}

const styles = StyleSheet.create({
  slidersBox: {
    width: W,
    gap: 4,
  },
  track: {
    width: W,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#71717a",
    justifyContent: "center",
  },
  knob: {
    position: "absolute",
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: "#fafafa",
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
    backgroundColor: "#fafafa",
  },
  closeBarA: {
    transform: [{ rotate: "45deg" }],
  },
  closeBarB: {
    transform: [{ rotate: "-45deg" }],
  },
  checkBox: {
    width: 16,
    height: 16,
  },
  checkBar: {
    position: "absolute",
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: "#0a0a0a", // dark on the emerald bound fill
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
