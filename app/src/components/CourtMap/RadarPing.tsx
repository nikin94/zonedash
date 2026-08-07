import { useEffect } from "react";
import { Animated, StyleSheet } from "react-native";

import { DOT } from "../../helpers/court";
import { colors } from "../../theme";
import { acquirePulse, pulseClock, releasePulse } from "./pulseClock";

/**
 * Expanding radar ring drawn behind a dot. Used two ways: a bright accent ping
 * on a lit exercise target ("armed" — react now), and a soft dim breath on the
 * unbound pairing spots ("pulse" — tap here). `color` picks between them. Every
 * ring reads the same shared clock (pulseClock), so a dot that starts pulsing
 * later — e.g. one re-opened by Undo — stays in phase with the rest.
 */
export const RadarPing = ({ color = colors.accent }: { color?: string }) => {
  // Join the shared breath while mounted; releasing the last ring stops the loop.
  useEffect(() => {
    acquirePulse();
    return releasePulse;
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      testID="dot-ping"
      style={[
        styles.ping,
        {
          borderColor: color,
          opacity: pulseClock.interpolate({
            inputRange: [0, 1],
            outputRange: [0.55, 0],
          }),
          transform: [
            {
              scale: pulseClock.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.7],
              }),
            },
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
    // borderColor comes from the `color` prop above.
  },
});
