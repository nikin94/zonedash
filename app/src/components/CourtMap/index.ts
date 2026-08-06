/**
 * Half-court map and its parts. One component per file: CourtMap (the map),
 * AnimatedDot / RadarPing (its dots, internal), and SpotIcon (a standalone
 * court-position glyph used in results). Shared geometry/metadata lives in
 * geometry.ts. This barrel keeps `import { … } from "../components/CourtMap"`
 * working.
 */
export { CourtMap } from "./CourtMap";
export { SpotIcon } from "./SpotIcon";
export { SPOT_NAMES, SPOT_CODES, type SpotVisual } from "./geometry";
