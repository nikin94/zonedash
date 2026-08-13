import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { BlurView } from "expo-blur";

import { SPOT_NAMES, SPOT_XY } from "../../domain/spot";
import {
  CENTRE_PAD,
  COURT_NET_THICKNESS,
  COURT_STRIP_H,
  DOT,
  HIT,
  HIT_SLOP,
  INSET,
  MAP_H,
  MAP_W,
  type SpotVisual,
} from "../../helpers/court";
import { rotateNorm } from "../../helpers/courtLines";
import { alpha, colors } from "../../theme";
import { AppText } from "../AppText";
import { CustomPressable } from "../CustomPressable";
import { RotateIcon } from "../Icons";
import { AnimatedDot, DOT_VARIANTS } from "./AnimatedDot";
import { CourtLines } from "./CourtLines";
import { CourtRoute } from "./CourtRoute";
import { RoutePreview } from "./RoutePreview";

// Screen-reader wording per state — the label must carry it, since fill and
// glyph are the only visual differentiators between the states.
const A11Y_STATE: Record<SpotVisual, string> = {
  off: "empty",
  available: "available",
  pulse: "tap to place a target here",
  active: "press here",
  armed: "target lit, react",
  confirm: "awaiting confirm",
  bound: "bound",
  selected: "selected",
  hit: "hit",
};

const STRIP_H = COURT_STRIP_H; // top/bottom net-line strip (shared source)
const ICON_BOX = 20; // rotate control's touch box
// The rotate control sits diagonally OUT from the court's top-right corner, an
// equal gap in x and y — clear of both the corner dot and the (now full) net
// line, so nothing overlaps.
const ICON_OUT = 10;

// Dots and the line markings share one transform (rotateNorm, helpers/court-
// lines): one turn maps (x, y) → (1 − y, x). The 8 perimeter spots stay on the
// perimeter, so a dot keeps its identity while its drawn position — and every
// court line — turns with the view together.

// Which court edge the NET sits on per rotation — the top row of spots turns
// clockwise with the view: top → right → bottom → left.
const NET_EDGE = ["top", "right", "bottom", "left"] as const;

/**
 * Half-court map. Pure renderer: the parent supplies each canonical spot's
 * visual state; taps (when enabled) report the canonical spot index.
 * `children` render centered inside the court — the perimeter is all dots, so
 * the middle is free real estate for the round's status text and action.
 *
 * `rotation` turns the VIEW in clockwise quarter turns (0–3) — the operator
 * moving around the hall. Each dot is drawn at its rotated position and the NET
 * label tracks to the matching edge, but the reported spot index is unchanged:
 * orientation is a display transform, never a spot-identity one. `onRotate`,
 * when given, renders a small rotate control in the court's top-right corner.
 */
export const CourtMap = ({
  spots,
  onPressSpot,
  badges,
  route,
  children,
  rotation = 0,
  onRotate,
  statusControl,
  hideOff = false,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
  /** Drop spots whose visual is "off" entirely — no dot, no hit target. The
   *  drill surface passes this so only the paired targets in play are drawn,
   *  keeping the schematic clean; the pairing round and the idle court leave it
   *  off so all 8 perimeter spots stay visible to pick from. */
  hideOff?: boolean;
  /** Optional Path drill route — the tapped spots in step order. Drawn as
   *  curved, directed, order-coloured segments between the dots (CourtRoute),
   *  under the dots so a target stays tappable. Omit outside Path authoring. */
  route?: number[];
  /** Optional per-spot order label (length 8, canonical order) — e.g. a Path
   *  step's ordinal(s) on the dot it lands on ("1", or "1·4" for a repeat).
   *  null = no badge. A pure display overlay: it rides on the dot, so it turns
   *  with the view like the dot does, and never intercepts a tap. */
  badges?: (string | null)[];
  children?: ReactNode;
  rotation?: number;
  onRotate?: () => void;
  /** Optional status affordance, drawn in the court's TOP-LEFT corner mirroring
   *  the rotate control's top-right (same inset). The court surfaces pass the
   *  central-unit CourtStatusControl; a control, so it never moves with the view. */
  statusControl?: ReactNode;
}) => {
  const r = ((rotation % 4) + 4) % 4;
  const edge = NET_EDGE[r];

  // Horizontal net (line ─ NET ─ line) for the top/bottom edges — a full line
  // both ways; the rotate control sits out past the corner, so nothing to clear.
  const hNet = (
    <View style={styles.netRow}>
      <View style={styles.netLine} />
      <AppText size={10} color={colors.textMuted} style={styles.netLabel}>
        NET
      </AppText>
      <View style={styles.netLine} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      {/* Two fixed-height strips frame the court so the layout — and the rotate
          control's level — never shift. NET occupies the strip on its current
          edge; the side edges get a small rotated label in the margin. */}
      <View style={styles.strip}>{edge === "top" && hNet}</View>

      <View style={styles.courtWrap}>
        {edge === "left" && (
          <AppText
            size={10}
            color={colors.textMuted}
            style={[styles.sideNet, styles.sideNetLeft]}
          >
            NET
          </AppText>
        )}
        {edge === "right" && (
          <AppText
            size={10}
            color={colors.textMuted}
            style={[styles.sideNet, styles.sideNetRight]}
          >
            NET
          </AppText>
        )}
        <View style={styles.court}>
          {/* Faint court markings under everything — a schematic backdrop that
              turns with the view (rotateNorm) but never eats a target's tap. */}
          <CourtLines rotation={r} width={MAP_W} height={MAP_H} />
          {/* The Path route (curved, directed, order-coloured) over the
              markings but under the dots — a target stays on top of its own
              line and keeps its tap. */}
          {route != null && route.length >= 2 && (
            <>
              <CourtRoute
                path={route}
                rotation={r}
                width={MAP_W}
                height={MAP_H}
              />
              {/* A marker looping the route curve, tracing the sequence so its
                  shape reads at a glance; rebuilds once the edits settle (not on
                  every tap). Over the route line, under the dots. */}
              <RoutePreview path={route} rotation={r} />
            </>
          )}
          {children != null && (
            // box-none: the centre content is interactive, the empty area around
            // it stays transparent to touches so the perimeter spots keep working.
            <View pointerEvents="box-none" style={styles.centre}>
              {/* A content-hugging frosted-glass card behind the whole centre
                  block: the title / info / controls crossing the centre line
                  read cleanly while the court markings behind BLUR out rather
                  than being fully masked — the same liquid-glass treatment as
                  the tab bar. The card clips the blur to its rounded corners. */}
              <View
                pointerEvents="box-none"
                testID="centre-card"
                style={styles.centreCard}
              >
                {/* The frost. tint "light" over the blur reads as a subtle
                    white glass; on Android expo-blur falls back to the
                    translucent fill (centreCard's backgroundColor). */}
                <BlurView
                  pointerEvents="none"
                  testID="centre-glass"
                  intensity={40}
                  tint="light"
                  style={StyleSheet.absoluteFill}
                />
                {children}
              </View>
            </View>
          )}
          {SPOT_XY.map((p, i) => {
            // With hideOff, an unassigned ("off") spot draws nothing — no dot
            // and no hit target — so the drill schematic shows only the paired
            // targets in play. An off spot never carries a badge or route
            // endpoint (both are Path-authoring on paired spots), so nothing
            // dangles by dropping it.
            if (hideOff && spots[i] === "off") return null;
            // Rotation moves the drawn position only — dot `i` still reports spot
            // `i`, so the wire/identity is untouched.
            const { x, y } = rotateNorm(p.x, p.y, r);
            const badge = badges?.[i] ?? null;
            return (
              <CustomPressable
                key={i}
                noFeedback
                disabled={!onPressSpot}
                hitSlop={HIT_SLOP}
                testID={`spot-${i}-${spots[i]}`}
                accessibilityLabel={
                  `${SPOT_NAMES[i]} spot, ${A11Y_STATE[spots[i]]}` +
                  (badge ? `, path step ${badge}` : "")
                }
                accessibilityState={{
                  disabled: !onPressSpot,
                  selected: spots[i] !== "off",
                }}
                onPress={() => onPressSpot?.(i)}
                style={[
                  styles.hit,
                  {
                    left: INSET + x * (MAP_W - HIT - 2 * INSET),
                    top: INSET + y * (MAP_H - HIT - 2 * INSET),
                  },
                ]}
              >
                {/* An app-background disc under the dot, so the target reads as
                    a solid button laid over the court schematic — the markings
                    behind it are masked and never show through a resting dot. */}
                <View
                  pointerEvents="none"
                  testID={`spot-bg-${i}`}
                  style={styles.dotBg}
                />
                <AnimatedDot
                  visual={spots[i]}
                  variant={DOT_VARIANTS[i % DOT_VARIANTS.length]}
                />
                {badge != null && (
                  <View
                    pointerEvents="none"
                    testID={`spot-badge-${i}`}
                    style={styles.badge}
                  >
                    <AppText size={11} weight="700" color={colors.background}>
                      {badge}
                    </AppText>
                  </View>
                )}
              </CustomPressable>
            );
          })}
        </View>
      </View>

      <View style={styles.strip}>{edge === "bottom" && hNet}</View>

      {onRotate && (
        <CustomPressable
          noFeedback
          hitSlop={10}
          testID="court-rotate"
          accessibilityLabel="Rotate the court view"
          accessibilityState={{ selected: r !== 0 }}
          onPress={onRotate}
          style={styles.rotate}
        >
          <RotateIcon size={14} color={colors.border} />
        </CustomPressable>
      )}

      {/* Status affordance in the OPPOSITE (top-left) corner from rotate, at the
          same diagonal inset, so the two controls frame the court symmetrically. */}
      {statusControl != null && (
        <View style={styles.status}>{statusControl}</View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  // Equal top/bottom strips: whichever holds the NET line, the court never
  // shifts vertically as the view rotates, and the rotate control keeps a
  // fixed level.
  strip: {
    height: STRIP_H,
    width: MAP_W,
    justifyContent: "center",
  },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  netLine: {
    flex: 1,
    height: COURT_NET_THICKNESS,
    backgroundColor: colors.border,
  },
  netLabel: {
    letterSpacing: 2,
  },
  courtWrap: {
    width: MAP_W,
  },
  // Small rotated NET label sitting just off a side edge (overflows into the
  // screen margin the centred court leaves free), for the 90°/270° views.
  sideNet: {
    position: "absolute",
    top: MAP_H / 2 - 8,
    letterSpacing: 2,
    transform: [{ rotate: "-90deg" }],
  },
  sideNetLeft: {
    left: -20,
  },
  sideNetRight: {
    right: -20,
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
    // A deliberately narrow info/controls column (see CENTRE_PAD): it clears
    // the perimeter dots' hit boxes with room to spare, leaving the freed
    // space to the bigger, further-inset targets.
    padding: CENTRE_PAD,
  },
  // Hugs the centre content (alignItems/justify on `centre` keep it centred).
  // A translucent white tint OVER the BlurView (not a solid fill) so the court
  // markings behind frost rather than vanish; `overflow: hidden` clips the blur
  // to the rounded corners. The tint doubles as the Android blur fallback.
  centreCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(colors.background, 0.6),
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: "hidden",
  },
  hit: {
    position: "absolute",
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  // Opaque app-background disc the size of the dot, sitting under it so the
  // court markings never bleed through a resting ("off"/available) target.
  dotBg: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.background,
  },
  // Order pill riding the dot's top-right — a darker accent chip with white
  // digits so it stays legible over the accent-filled selected dot underneath.
  // pointerEvents none (set on the View) so it never eats the dot's tap.
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accentText,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  // Bare icon (no outline/fill), same colour as the net line, carried OUT past
  // the court's top-right corner (an ICON_OUT gap to the right) and raised so its
  // CENTRE sits on the net line — the strip's mid-line (STRIP_H / 2). That levels
  // the rotate icon, the status dot and the net line on one row. It's a control,
  // so it never moves with the view.
  rotate: {
    position: "absolute",
    top: STRIP_H / 2 - ICON_BOX / 2,
    right: -(ICON_OUT + ICON_BOX / 2),
    height: ICON_BOX,
    width: ICON_BOX,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mirror of `rotate` on the LEFT corner — same top inset, `left` matching
  // rotate's `right`, so the status control and rotate sit symmetrically on the
  // net line's level.
  status: {
    position: "absolute",
    top: STRIP_H / 2 - ICON_BOX / 2,
    left: -(ICON_OUT + ICON_BOX / 2),
    height: ICON_BOX,
    width: ICON_BOX,
    alignItems: "center",
    justifyContent: "center",
  },
});
