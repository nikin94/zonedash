import { memo } from "react";

import { type SpotVisual } from "../../helpers/court";
import { DotBullseye } from "./DotBullseye";
import { DotHollow } from "./DotHollow";
import { DotPuck } from "./DotPuck";

/**
 * The court-dot restyle is shipped as a THREE-WAY comparison: every spot draws
 * one of three looks so they can be judged side by side on a real court, then
 * the two losers get deleted. CourtMap assigns them per spot index (see
 * DOT_VARIANTS) so adjacent targets differ — "разбить через один".
 *
 * All three share the cross-fade + glyph machinery (dotShared), so they behave
 * identically (one native-driven fade per state change, the same radar-ping /
 * check glyphs) and differ only in appearance:
 *  - bullseye — concentric target, filled core (default)
 *  - puck     — elevated disc with a coloured glow
 *  - hollow   — outlined idle that fills solid when lit
 *
 * memo: the panel re-renders on every Status event; a dot re-renders only when
 * ITS visual actually changes.
 */
export type DotVariant = "bullseye" | "puck" | "hollow";

/** Variant per spot index, cycled — so no two neighbouring targets share a look
 *  and all three are on the court at once for comparison. */
export const DOT_VARIANTS: DotVariant[] = ["bullseye", "puck", "hollow"];

export const AnimatedDot = memo(
  ({
    visual,
    variant = "bullseye",
  }: {
    visual: SpotVisual;
    variant?: DotVariant;
  }) => {
    switch (variant) {
      case "puck":
        return <DotPuck visual={visual} />;
      case "hollow":
        return <DotHollow visual={visual} />;
      default:
        return <DotBullseye visual={visual} />;
    }
  },
);
