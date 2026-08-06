import { Dimensions } from "react-native";

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

// Two-letter code per canonical spot (FL, MR, BC, …) — the compact results
// label. Single source is domain/spot.ts, where it is derived from the same
// (row, col) key we store, so display and storage can't drift. Re-exported
// here since the map is where callers already reach for spot metadata.
export { SPOT_CODES } from "../../domain/spot";

/**
 * Canonical spot geometry with the NET at the TOP of the map — the same
 * layout the HUB75 panel draws (display-ui.md "layout map"), so the phone and
 * the LED display always light the same dot. Clockwise from net-left:
 *   0 ─ 1 ─ 2   ← net line
 *   7       3
 *   6 ─ 5 ─ 4   ← back line
 */
export const SPOT_XY = [
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
export const MAP_W = Math.min(Dimensions.get("window").width - 56, 340);
export const MAP_H = Math.round(MAP_W * 1.09);
export const HIT = 52; // pressable hit box; the visible dot is smaller
export const HIT_SLOP = 8; // extra forgiveness around each spot
export const DOT = 38; // visible dot diameter — one size for every state
// Inset the whole spot grid off the field edges. Without it a dot's visible
// edge sits (HIT-DOT)/2 = 7 px inside the border; adding that again doubles the
// dot-to-border gap so the perimeter isn't crammed against the lines.
export const INSET = (HIT - DOT) / 2;
