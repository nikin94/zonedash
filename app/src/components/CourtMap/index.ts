/**
 * Half-court map and its parts. One component per file: CourtMap (the map),
 * AnimatedDot / RadarPing (its dots, internal), and SpotIcon (a standalone
 * court-position glyph used in results). This barrel exports only the
 * components; spot facts live in domain/spot.ts and the view constants /
 * SpotVisual in helpers/court.ts.
 */
export { CourtMap } from "./CourtMap";
export { SpotIcon } from "./SpotIcon";
