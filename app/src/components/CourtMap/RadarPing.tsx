import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { DOT } from "../../helpers/court";
import { colors } from "../../theme";

// A diverging ring that expands and fades on a loop, drawn behind a lit
// exercise target — the "react now" cue (a spinner would read as loading).
const PING_MS = 1200;

/** Expanding radar ring behind a lit exercise target (the "armed" dot state). */
export const RadarPing = () => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: PING_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      testID="dot-ping"
      style={[
        styles.ping,
        {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) },
          ],
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  ping: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.accent,
  },
});
