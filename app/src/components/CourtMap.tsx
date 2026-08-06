import { memo, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from "react-native";

import { alpha, colors } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";
import { CheckIcon } from "./Icons";

/** Visual state of one canonical spot on the map. */
export type SpotVisual =
  | "off" // faint outline — a potential location, nothing assigned
  | "available" // pairing round waiting for the operator to pick this (or any) spot
  | "active" // pairing prompt ("press here") — in-progress spinner, not a color
  | "armed" // exercise run: target lit, waiting for the athlete — radar ping
  | "confirm" // candidate tapped once, awaiting the confirm tap
  | "bound" // bound (this round / done) — green with a check mark
  | "selected" // a static pick (e.g. a path step in the drill builder)
  | "hit"; // exercise run: step resolved as a hit — green flash with a check

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
 * Two-letter code per canonical spot, for compact labels (e.g. the results
 * list). Row from the net down — F(ront)/M(id)/B(ack) — then column
 * L(eft)/C(entre)/R(ight). C is used for the centre column so the letter never
 * collides with the M of the mid row (FL, FC, FR / ML, MR / BL, BC, BR).
 */
export const SPOT_CODES = [
  "FL", // 0 net left
  "FC", // 1 net centre
  "FR", // 2 net right
  "MR", // 3 mid right
  "BR", // 4 back right
  "BC", // 5 back centre
  "BL", // 6 back left
  "ML", // 7 mid left
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

// Wide but with breathing room at the sides, capped for tablets; a half
// court is slightly longer than wide.
const MAP_W = Math.min(Dimensions.get("window").width - 56, 340);
const MAP_H = Math.round(MAP_W * 1.09);
const HIT = 52; // pressable hit box; the visible dot is smaller
const HIT_SLOP = 8; // extra forgiveness around each spot
const DOT = 38; // visible dot diameter — one size for every state
// Inset the whole spot grid off the field edges. Without it a dot's visible
// edge sits (HIT-DOT)/2 = 7 px inside the border; adding that again doubles the
// dot-to-border gap so the perimeter isn't crammed against the lines.
const INSET = (HIT - DOT) / 2;

// Fill + outline per state. "off" fades to a zero-alpha fill (outline only)
// instead of snapping away. "active" (pairing) is a neutral dark fill under a
// spinner — it means "loading". "armed" (a lit exercise target) is a bright
// accent fill under a radar ping — it means "react now", never a spinner.
const DOT_STYLE: Record<SpotVisual, { fill: string; ring: string }> = {
  off: { fill: alpha(colors.border, 0), ring: colors.border },
  available: { fill: colors.dim, ring: alpha(colors.border, 0) },
  active: { fill: colors.surface, ring: colors.border },
  armed: { fill: colors.accent, ring: alpha(colors.border, 0) },
  confirm: { fill: colors.warning, ring: alpha(colors.border, 0) },
  bound: { fill: colors.success, ring: alpha(colors.border, 0) },
  selected: { fill: colors.accent, ring: alpha(colors.border, 0) },
  hit: { fill: colors.success, ring: alpha(colors.border, 0) },
};

const FADE_MS = 200;

// Screen-reader wording per state — the label must carry it, since fill and
// glyph are the only visual differentiators between the states.
const A11Y_STATE: Record<SpotVisual, string> = {
  off: "empty",
  available: "available",
  active: "press here",
  armed: "target lit, react",
  confirm: "awaiting confirm",
  bound: "bound",
  selected: "selected",
  hit: "hit",
};

// A diverging ring that expands and fades on a loop, drawn behind a lit
// exercise target — the "react now" cue (a spinner would read as loading).
const PING_MS = 1200;

const RadarPing = () => {
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

/**
 * One court dot, cross-fading on every state change instead of snapping.
 * Two statically-colored layers: the base wears the NEW state's colors, an
 * overlay wears the OLD state's and fades its opacity 1→0 on the native
 * driver. No color interpolation at all — the previous approach reset a
 * JS-driven color fade in a layout effect, and when all 8 dots changed at
 * once (Start pairing) that reset could slip past a frame under JS load:
 * a flash of the new color, a snap back, then the fade — read as a double
 * blink. With static layers the commit frame is pixel-identical to the
 * previous one (old color at full opacity), so no flash is possible, and
 * the opacity fade runs on the UI thread regardless of JS load.
 *
 * memo: the panel re-renders on every Status event (prompt, confirm,
 * session); a dot re-renders only when ITS visual actually changes.
 */
const AnimatedDot = memo(({ visual }: { visual: SpotVisual }) => {
  const fromRef = useRef(visual);
  const toRef = useRef(visual);
  const overlayRef = useRef(new Animated.Value(0));

  // Detect the change during render. A FRESH value born at 1 (instead of
  // setValue on the live one, which would force-update the Animated view
  // mid-render) attaches with this commit — the first painted frame shows the
  // old color at full strength, so it matches the previous frame exactly.
  if (visual !== toRef.current) {
    fromRef.current = toRef.current;
    toRef.current = visual;
    overlayRef.current = new Animated.Value(1);
  }

  useLayoutEffect(() => {
    if (fromRef.current === toRef.current) return;
    const overlay = overlayRef.current;
    Animated.timing(overlay, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true, // opacity-only — off the JS thread entirely
    }).start(({ finished }) => {
      // Settle so a later unrelated effect run can't replay this fade; a
      // superseded fade (its value already swapped out) must not settle.
      if (finished && overlayRef.current === overlay) {
        fromRef.current = toRef.current;
      }
    });
  }, [visual]);

  const from = DOT_STYLE[fromRef.current];
  const to = DOT_STYLE[toRef.current];
  return (
    <View style={[styles.dot, { backgroundColor: to.fill, borderColor: to.ring }]}>
      <Animated.View
        style={[
          styles.dotOverlay,
          {
            backgroundColor: from.fill,
            borderColor: from.ring,
            opacity: overlayRef.current,
          },
        ]}
      />
      {/* Glyphs sit above the fade overlay so they appear with the new state:
          a spinner while a pairing spot is prompted (loading), a radar ping on
          a lit exercise target (react now), a check on bound/hit. */}
      {toRef.current === "active" && (
        <ActivityIndicator testID="dot-spinner" size="small" color={colors.text} />
      )}
      {toRef.current === "armed" && <RadarPing />}
      {(toRef.current === "bound" || toRef.current === "hit") && (
        <View testID="dot-check" style={styles.dotGlyph}>
          <CheckIcon />
        </View>
      )}
    </View>
  );
});

/**
 * Half-court map. Pure renderer: the parent supplies each canonical spot's
 * visual state; taps (when enabled) report the canonical spot index.
 * `children` render centered inside the court — the perimeter is all dots, so
 * the middle is free real estate for the round's status text and action.
 */
export const CourtMap = ({
  spots,
  onPressSpot,
  children,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
  children?: ReactNode;
}) => (
  <View style={styles.wrap}>
    <View style={styles.netRow}>
      <View style={styles.netLine} />
      <AppText size={10} color={colors.textMuted} style={styles.netLabel}>
        NET
      </AppText>
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
        <CustomPressable
          key={i}
          noFeedback
          disabled={!onPressSpot}
          hitSlop={HIT_SLOP}
          testID={`spot-${i}-${spots[i]}`}
          accessibilityLabel={`${SPOT_NAMES[i]} spot, ${A11Y_STATE[spots[i]]}`}
          accessibilityState={{ disabled: !onPressSpot, selected: spots[i] !== "off" }}
          onPress={() => onPressSpot?.(i)}
          style={[
            styles.hit,
            {
              left: INSET + p.x * (MAP_W - HIT - 2 * INSET),
              top: INSET + p.y * (MAP_H - HIT - 2 * INSET),
            },
          ]}
        >
          <AnimatedDot visual={spots[i]} />
        </CustomPressable>
      ))}
    </View>
  </View>
);

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
    backgroundColor: colors.border,
  },
  netLabel: {
    letterSpacing: 2,
  },
  court: {
    width: MAP_W,
    height: MAP_H,
    borderWidth: 1,
    borderColor: colors.border,
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
    // Keep the centre content well clear of the perimeter dots' hit boxes —
    // breathing room so the info block never crowds the spots.
    padding: HIT + 24,
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
  // always present with a per-state color, so "off" cross-fades too. Centers
  // the state glyph (spinner / check).
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dotGlyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Expanding radar ring behind a lit exercise target.
  ping: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  // The old-color layer covers the base including its border (-1 offsets, so
  // its diameter is DOT + 2 and its radius must match — a hardcoded radius
  // here once lagged a dot resize and drew as a rounded square mid-fade),
  // then fades out to reveal the new color underneath.
  dotOverlay: {
    position: "absolute",
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: DOT / 2 + 1,
    borderWidth: 1,
  },
});
