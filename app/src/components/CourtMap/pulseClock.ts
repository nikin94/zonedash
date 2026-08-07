import { Animated } from "react-native";

/**
 * One shared radar-breath phase every RadarPing reads, so all pulsing dots stay
 * in sync no matter when each one mounts. A single self-owned requestAnimationFrame
 * loop writes an eased 0→1 sawtooth into `pulseClock` via setValue; every attached
 * ring — including one that mounts mid-cycle — picks up each frame.
 *
 * Why a hand-rolled rAF loop instead of Animated.loop: both drivers stall for a
 * ring that mounts AFTER the loop started.
 *  - A native-driven shared value stops pushing frames to rings that mount late
 *    (a spot re-opened by Undo, or the next drill target after a gap).
 *  - A JS-driven Animated.loop PAUSES whenever it has zero attached views — every
 *    gap between lit targets during a drill — and a one-shot start guard never let
 *    it resume, so the pulse froze mid-game.
 * Our own loop runs independent of any view and setValue flushes to whatever is
 * mounted, so the pulse never freezes and stays phase-synced.
 *
 * Ref-counted: the loop runs only while ≥1 ring is mounted. Its phase origin
 * resets on a cold start (0→1 rings) — harmless to sync since a lone ring has
 * nobody to match, and a round always keeps at least one ring up, so a
 * re-opened (Undo) spot rejoins in step.
 */
export const PING_MS = 1200;

export const pulseClock = new Animated.Value(0);

let rafId: number | null = null;
let mounted = 0;
let originMs = 0;

const tick = (nowMs: number) => {
  if (originMs === 0) originMs = nowMs;
  const t = ((nowMs - originMs) % PING_MS) / PING_MS; // 0..1 sawtooth
  // Ease-out quad — matches the previous Easing.out(Easing.quad) feel.
  pulseClock.setValue(1 - (1 - t) * (1 - t));
  rafId = requestAnimationFrame(tick);
};

/** A ring mounted — start the shared loop if it isn't already running. */
export const acquirePulse = () => {
  mounted += 1;
  // Under jest (fake timers) a rAF loop would spin runAllTimersAsync forever, and
  // motion isn't asserted — the ring just needs to render — so skip the loop there.
  if (rafId === null && process.env.JEST_WORKER_ID === undefined) {
    originMs = 0; // fresh phase on a cold start
    rafId = requestAnimationFrame(tick);
  }
};

/** A ring unmounted — stop the loop once the last ring is gone. */
export const releasePulse = () => {
  mounted = Math.max(0, mounted - 1);
  if (mounted === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};
