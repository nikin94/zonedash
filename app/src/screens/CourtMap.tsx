import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";

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

const DOT_COLOR: Record<SpotVisual, string> = {
  off: "transparent",
  available: "#52525b",
  active: "#818cf8",
  confirm: "#fbbf24",
  bound: "#34d399",
};

/**
 * Half-court map. Pure renderer: the parent supplies each canonical spot's
 * visual state; taps (when enabled) report the canonical spot index.
 */
export function CourtMap({
  spots,
  onPressSpot,
}: {
  spots: SpotVisual[]; // length 8, canonical order
  onPressSpot?: (index: number) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.netRow}>
        <View style={styles.netLine} />
        <Text style={styles.netLabel}>NET</Text>
        <View style={styles.netLine} />
      </View>
      <View style={styles.court}>
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
            <View
              style={[
                styles.dot,
                { backgroundColor: DOT_COLOR[spots[i]] },
                spots[i] === "off" && styles.dotOff,
                (spots[i] === "active" || spots[i] === "confirm") &&
                  styles.dotEmphasis,
              ]}
            />
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
  hit: {
    position: "absolute",
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  dotOff: {
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  dotEmphasis: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
});
