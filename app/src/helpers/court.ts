import { Dimensions } from "react-native";

/**
 * Court-map view helpers: the pixel/layout constants CourtMap and its dots
 * render with, plus the per-spot visual-state vocabulary. These are render
 * concerns (not spot facts — those live in domain/spot.ts), kept out of the
 * component folder so a file there is always a component.
 */

/** Visual state of one canonical spot on the map. */
export type SpotVisual =
  | "off" // faint outline — a potential location, nothing assigned
  | "available" // a tappable but resting spot (e.g. a paired spot on the drill map)
  | "pulse" // pairing round: an unbound spot inviting a tap — a soft radar breath
  | "active" // pairing prompt ("press here") — in-progress spinner, not a color
  | "armed" // exercise run: target lit, waiting for the athlete — radar ping
  | "confirm" // candidate tapped once, awaiting the confirm tap
  | "bound" // bound (this round / done) — green with a check mark
  | "selected" // a static pick (e.g. a path step in the drill builder)
  | "hit"; // exercise run: step resolved as a hit — green flash with a check

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
