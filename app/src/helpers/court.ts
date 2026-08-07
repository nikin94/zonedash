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
export const HIT = 56; // pressable hit box; the visible dot is smaller
export const HIT_SLOP = 8; // extra forgiveness around each spot
export const DOT = 44; // visible dot diameter — one size for every state
// Push the whole spot grid further off the field edges than the bare
// hit-box centring would (was (HIT-DOT)/2), so bigger targets keep clear of
// the court lines.
export const INSET = 16;
// Padding around the centre info/controls block. It is deliberately ~1.5×
// narrower than the old block (which cleared HIT+24 = 76 px each side): a
// tighter block frees the perimeter for the larger, further-inset targets.
// Derived from MAP_W so the ratio holds across phone widths.
const CENTRE_CONTENT = Math.round((MAP_W - 2 * 76) / 1.5);
export const CENTRE_PAD = Math.round((MAP_W - CENTRE_CONTENT) / 2);
