import { Animated, Easing } from "react-native";

/**
 * One shared radar-breath clock every RadarPing reads from, so all pulsing dots
 * stay in phase no matter when each one mounts. Without it each ping ran its own
 * loop starting at phase 0, so a dot that begins pulsing later — e.g. a pairing
 * spot re-opened by Undo — breathed out of step with the rest. A single
 * looping native-driver value is effectively free even with no rings on screen,
 * so it is started once (on the first ping to mount) and never stopped.
 */
export const PING_MS = 1200;

export const pulseClock = new Animated.Value(0);

let running = false;

export const startPulseClock = () => {
  if (running) return;
  running = true;
  Animated.loop(
    Animated.timing(pulseClock, {
      toValue: 1,
      duration: PING_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }),
  ).start();
};
