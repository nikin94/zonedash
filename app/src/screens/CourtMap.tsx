import { memo, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

/** Visual state of one canonical spot on the map. */
export type SpotVisual =
  | "off" // faint outline — a potential location, nothing assigned
  | "available" // pairing round waiting for the operator to pick this (or any) spot
  | "active" // being prompted ("press here")
  | "confirm" // candidate tapped once, awaiting the confirm tap
  | "bound"; // bound (this round / done)

/** Human names for the canonical spots, for prompts and screen readers. */
export const SPOT_NAMES = [
  "net left",
  "net centre",
  "net right",
  "mid right",
  "back right",
  "back centre",
  "back left",
  "mid left",
] as const;

/**
 * Canonical spot geometry with the NET at the TOP of the map — the same
 * layout the HUB75 panel draws (display-ui.md "layout map"), so the phone and
 * the LED display always light the same dot. Clockwise from net-left:
 *   0 ─ 1 ─ 2   ← net line
 *   7       3
 *   6 ─ 5 ─ 4   ← back line
 */
const SPOT_XY = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 0.5 },
  { x: 1, y: 1 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0.5 },
] as const;

// Nearly full-screen width (small side margins), capped for tablets; a half
// court is slightly longer than wide.
const MAP_W = Math.min(Dimensions.get("window").width - 32, 380);
const MAP_H = Math.round(MAP_W * 1.09);
const HIT = 48; // pressable hit box; the visible dot is smaller
const HIT_SLOP = 8; // extra forgiveness around each spot

// Fill + outline per state, as rgba so Animated can interpolate between them.
// "off" fades to a zero-alpha fill (outline only) instead of snapping away.
const DOT_STYLE: Record<SpotVisual, { fill: string; ring: string }> = {
  off: { fill: "rgba(63,63,70,0)", ring: "rgba(63,63,70,1)" },
  available: { fill: "rgba(82,82,91,1)", ring: "rgba(63,63,70,0)" },
  active: { fill: "rgba(129,140,248,1)", ring: "rgba(63,63,70,0)" },
  confirm: { fill: "rgba(251,191,36,1)", ring: "rgba(63,63,70,0)" },
  bound: { fill: "rgba(52,211,153,1)", ring: "rgba(63,63,70,0)" },
};

const FADE_MS = 200;

/**
 * One court dot, cross-fading its fill/outline on every state change instead
 * of snapping. Plain Animated (JS driver) on purpose: a 200 ms color fade
 * needs no Reanimated dependency, and color interpolation can't use the
 * native driver anyway.
 *
 * memo: the panel re-renders on every Status event (prompt, confirm, session),
 * and a re-render used to recreate this dot's interpolation nodes while a fade
 * was in flight — each event read as an extra blink on dots whose state hadn't
 * changed. With memo, a dot re-renders only when ITS visual actually changes.
 */
const AnimatedDot = memo(function AnimatedDot({
  visual,
}: {
  visual: SpotVisual;
}) {
  const anim = useRef(new Animated.Value(1)).current;
  const fromRef = useRef(visual);
  const toRef = useRef(visual);

  // Swap the interpolation range during render so this commit already maps
  // from the previous color; the value reset lives in the layout effect below,
  // which runs before the frame paints (no one-frame snap).
  if (visual !== toRef.current) {
    fromRef.current = toRef.current;
    toRef.current = visual;
  }

  useLayoutEffect(() => {
    if (fromRef.current === toRef.current) return;
    // A superseded fade must not keep writing frames over the new one — that
    // races the reset below and reads as repeated blinking.
    anim.stopAnimation();
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: false, // color interpolation is JS-driver only
    }).start(({ finished }) => {
      // Settle so a later unrelated effect run can't replay this fade.
      if (finished) fromRef.current = toRef.current;
    });
  }, [visual, anim]);

  const from = DOT_STYLE[fromRef.current];
  const to = DOT_STYLE[toRef.current];
  const range = { inputRange: [0, 1] };
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: anim.interpolate({
            ...range,
            outputRange: [from.fill, to.fill],
          }),
          borderColor: anim.interpolate({
            ...range,
            outputRange: [from.ring, to.ring],
          }),
        },
      ]}
    />
  );
});

/**
 * Half-court map. Pure renderer: the parent supplies each canonical spot's
 * visual state; taps (when enabled) report the canonical spot index.
 * `children` render centered inside the court — the perimeter is all dots, so
 * the middle is free real estate for the round's status text and action.
 */
export function CourtMap({
  spots,
  onPressSpot,
  children,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
  children?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.netRow}>
        <View style={styles.netLine} />
        <Text style={styles.netLabel}>NET</Text>
        <View style={styles.netLine} />
      </View>
      <View style={styles.court}>
        {children != null && (
          // box-none: the centre content is interactive, the empty area around
          // it stays transparent to touches so the perimeter spots keep working.
          <View pointerEvents="box-none" style={styles.centre}>
            {children}
          </View>
        )}
        {SPOT_XY.map((p, i) => (
          <Pressable
            key={i}
            testID={`spot-${i}-${spots[i]}`}
            accessibilityRole="button"
            accessibilityLabel={`${SPOT_NAMES[i]} spot`}
            accessibilityState={{ selected: spots[i] !== "off" }}
            disabled={!onPressSpot}
            onPress={() => onPressSpot?.(i)}
            hitSlop={HIT_SLOP}
            style={[
              styles.hit,
              { left: p.x * (MAP_W - HIT), top: p.y * (MAP_H - HIT) },
            ]}
          >
            <AnimatedDot visual={spots[i]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  netRow: {
    width: MAP_W,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  netLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#3f3f46",
  },
  netLabel: {
    color: "#71717a",
    fontSize: 10,
    letterSpacing: 2,
  },
  court: {
    width: MAP_W,
    height: MAP_H,
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 4,
  },
  centre: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    // Keep the centre content clear of the perimeter dots' hit boxes.
    padding: HIT + 8,
  },
  hit: {
    position: "absolute",
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  // One size for every state — the active/confirm emphasis is color, not
  // scale, so idle and bound spots are just as easy to hit. The border is
  // always present with an animated color, so "off" cross-fades too.
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
});
