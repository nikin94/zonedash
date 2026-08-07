import { Animated, Easing } from "react-native";

/**
 * One shared radar-breath clock every RadarPing reads from, so all pulsing dots
 * stay in phase no matter when each one mounts. Without it each ping ran its own
 * loop starting at phase 0, so a dot that begins pulsing later — e.g. a pairing
 * spot re-opened by Undo — breathed out of step with the rest. A single
 * looping value is effectively free even with no rings on screen, so it is
 * started once (on the first ping to mount) and never stopped.
 *
 * JS-driven on purpose (useNativeDriver: false). A native-driven shared value
 * stops pushing frames to rings that mount AFTER the loop started — so a spot
 * that goes static during a prompt and pulses again once the bind lands never
 * resumed breathing. A JS-driven value updates every attached view each frame,
 * including freshly-mounted ones, so the pulse always restarts.
 */
export const PING_MS = 1200;

export const pulseClock = new Animated.Value(0);

let running = false;

export const startPulseClock = () => {
  if (running) return;
  running = true;
  const loop = Animated.loop(
    Animated.timing(pulseClock, {
      toValue: 1,
      duration: PING_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }),
  );
  // Under jest (fake timers) a JS-driven infinite loop would make
  // runAllTimersAsync() spin forever. Motion isn't asserted in tests — the ring
  // just needs to render — so skip the loop there and leave the clock at rest.
  if (process.env.JEST_WORKER_ID === undefined) loop.start();
};
