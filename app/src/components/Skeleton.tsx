import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors } from "../theme";

/**
 * A shimmering placeholder block — the "content is loading" affordance the app
 * shows instead of a spinner, so a list/panel keeps its shape while its data
 * loads and the swap to real content reads as a fill rather than a pop-in
 * (per the app's native-feel guidelines: skeletons are perceived as faster).
 *
 * A single neutral block whose opacity breathes between two alphas on the UI
 * thread (native-driven, off the JS thread). Compose several (with fixed
 * width/height/radius) to mirror the shape of whatever is loading; the History
 * list stacks a few rows of them. Purely presentational — no data, no timers a
 * caller owns.
 */
export const Skeleton = ({
  width,
  height = 14,
  radius = 6,
  style,
  testID,
}: {
  /** Block width — a number (px) or a percentage string ("60%"). */
  width?: number | `${number}%`;
  /** Block height in px. Defaults to a text-line height. */
  height?: number;
  /** Corner radius in px. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) => {
  // Breathe opacity between a faint and a stronger tint. A fresh value per mount
  // so nothing is shared across blocks; the loop runs on the native driver.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Under jest (fake timers) a driven loop would spin runAllTimersAsync
    // forever, and motion isn't asserted — the block just needs to render — so
    // skip the loop there (same guard pulseClock uses for its rAF loop).
    if (process.env.JEST_WORKER_ID !== undefined) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      testID={testID}
      accessible={false}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceAlt,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.5, 1],
          }),
        },
        style,
      ]}
    />
  );
};

/**
 * One History-row-shaped skeleton: a lead column (a headline + meta line) and a
 * right-aligned stats column (average + best), matching HistoryPanel's row so
 * the swap to real rows doesn't shift the layout. The row no longer carries a
 * mode label (the History mode tabs say the mode), so the lead's headline block
 * now stands in for the runner name over the meta line.
 */
export const HistoryRowSkeleton = () => (
  <View style={styles.row}>
    <View style={styles.lead}>
      <Skeleton width={90} height={14} />
      <Skeleton width={140} height={13} />
    </View>
    <View style={styles.stats}>
      <Skeleton width={48} height={15} />
      <Skeleton width={60} height={12} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  // Mirrors HistoryPanel's rowLead — a tight two-line stack.
  lead: {
    flexShrink: 1,
    gap: 6,
  },
  stats: {
    alignItems: "flex-end",
    gap: 6,
  },
});
