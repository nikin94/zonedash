import { useReducer, useRef } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from "react-native";

import { colors } from "../../theme";
import { AppText } from "../AppText";
import { CustomPressable } from "../CustomPressable";

/** Gap after each chip — animated to 0 as a chip collapses so the space it held
 *  closes with it, not just the chip body. */
export const CHIP_GAP = 8;
/** Collapse duration on removal — quick enough to feel responsive, long enough
 *  to read as "this step slid out" rather than a snap. */
const CHIP_COLLAPSE_MS = 180;

/**
 * One ordered Path step, as a removable chip. Tapping it doesn't drop the step
 * instantly — the chip animates its width and opacity to 0 (a sideways collapse
 * that closes its gap too), then calls `onRemove`, so the sequence visibly
 * shrinks rather than blinking a slot away.
 *
 * The chips are index-keyed (path entries repeat, so there's no stable id), and
 * an index-keyed instance is reused for a DIFFERENT step when an earlier one is
 * removed. A reused instance would inherit the finished collapse (progress at 0
 * → invisible). Guard it the way AnimatedDot does: detect the identity change in
 * render and reset synchronously, so the step it now represents paints fresh.
 */
export const PathChip = ({
  index,
  code,
  label,
  onRemove,
}: {
  index: number;
  code: string;
  label: string;
  onRemove: () => void;
}) => {
  // 1 = fully present, 0 = fully collapsed. Width/margin/opacity ride on it.
  // Held in a reassignable ref (not `.current` pinned once) so an instance reused
  // for a different step can swap in a FRESH value in render — see the reset below.
  const progressRef = useRef(new Animated.Value(1));
  // The chip's natural (laid-out) width, captured continuously while present so
  // a collapse can animate down from the real width, and frozen once collapsing.
  const naturalW = useRef(0);
  // Non-null once collapsing — the width the collapse animates down from.
  const collapseW = useRef<number | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);

  // Render-phase reset: a reused instance now stands for a different step, so
  // clear any inherited collapse before it paints (no invisible-chip flicker).
  // A FRESH Animated.Value (born at 1) is swapped in rather than setValue(1) on
  // the live one — the mounted value can't be written during render without a
  // "setState while rendering" warning; a new, unattached value can. Same idiom
  // as AnimatedDot's overlay.
  const identity = `${index}:${code}`;
  const idRef = useRef(identity);
  if (idRef.current !== identity) {
    idRef.current = identity;
    progressRef.current = new Animated.Value(1);
    collapseW.current = null;
  }
  const progress = progressRef.current;

  const onLayout = (e: LayoutChangeEvent) => {
    if (collapseW.current === null) naturalW.current = e.nativeEvent.layout.width;
  };

  const remove = () => {
    if (collapseW.current !== null) return; // already collapsing — ignore repeats
    collapseW.current = naturalW.current;
    force(); // switch into the clipped, animated-width layout
    Animated.timing(progress, {
      toValue: 0,
      duration: CHIP_COLLAPSE_MS,
      // width / margin aren't native-drivable, so this runs on the JS driver.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onRemove();
    });
  };

  const collapsing = collapseW.current !== null;
  const wrapStyle = collapsing
    ? {
        width: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, collapseW.current ?? 0],
        }),
        marginRight: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, CHIP_GAP],
        }),
        opacity: progress,
        overflow: "hidden" as const,
      }
    : { marginRight: CHIP_GAP };

  return (
    <Animated.View style={wrapStyle}>
      <CustomPressable
        noFeedback
        testID={`path-chip-${index}`}
        accessibilityLabel={`Step ${index + 1}, ${label} — tap to remove`}
        onPress={remove}
        onLayout={onLayout}
        // Freeze the body at its natural width while the wrapper clips it, so
        // the content slides out of view instead of reflowing as it shrinks.
        style={[styles.chip, collapsing && { width: collapseW.current ?? undefined }]}
      >
        <View style={styles.num}>
          <AppText size={11} weight="700" color={colors.background}>
            {index + 1}
          </AppText>
        </View>
        <AppText
          size={13}
          weight="600"
          color={colors.accentText}
          testID={`path-chip-code-${index}`}
        >
          {code}
        </AppText>
      </CustomPressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentSurface,
    borderRadius: 14,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
  },
  num: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.accentText,
    alignItems: "center",
    justifyContent: "center",
  },
});
