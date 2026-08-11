/**
 * Badminton half-court line markings, as normalised [0,1] segments in the same
 * net-at-top frame as the spot geometry (domain/spot.ts SPOT_XY). A view scales
 * them to pixels and rotates them with `rotateNorm` — the SAME transform the
 * dots use — so the schematic always tracks the dots as the court view turns.
 *
 * Real BWF dimensions (half-court, net → back boundary; doubles):
 *   length (net → baseline)      6.70 m   (13.40 m full / 2)
 *   width  (doubles sidelines)   6.10 m
 *   short service line           1.98 m from the net
 *   doubles long service line    5.94 m from the net (0.76 m in from the back)
 *   singles sideline             0.46 m in from each doubles sideline
 * The map's own aspect (MAP_H/MAP_W ≈ 1.09) already matches 6.70/6.10 ≈ 1.098,
 * so the fractions below land in true proportion at 0°/180°.
 * See app/supabase-independent note: sizes per BWF Laws of Badminton, Appendix.
 */

const HALF_LEN_M = 6.7; // net → baseline
const WIDTH_M = 6.1; // doubles width
const SHORT_SERVICE_M = 1.98; // from the net
const DOUBLES_LONG_SERVICE_M = 5.94; // from the net
const SINGLES_INSET_M = 0.46; // singles sideline in from the doubles sideline

// Normalised positions along each axis.
const SHORT_Y = SHORT_SERVICE_M / HALF_LEN_M; // ≈ 0.296
const LONG_Y = DOUBLES_LONG_SERVICE_M / HALF_LEN_M; // ≈ 0.887
const SINGLES_X = SINGLES_INSET_M / WIDTH_M; // ≈ 0.075

/** A line segment in normalised court coordinates (net-at-top frame). */
export interface NormSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The interior court lines. The outer boundary (doubles sidelines, net line,
 * back boundary) is the court box's own border, so it is NOT repeated here —
 * only the markings drawn inside it.
 *   - short service line (full width)
 *   - doubles long service line (full width)
 *   - centre line (net-side end at the short service line, per the Laws)
 *   - the two singles sidelines (full length)
 */
export const COURT_LINES: readonly NormSeg[] = [
  { x1: 0, y1: SHORT_Y, x2: 1, y2: SHORT_Y }, // short service line
  { x1: 0, y1: LONG_Y, x2: 1, y2: LONG_Y }, // doubles long service line
  { x1: 0.5, y1: SHORT_Y, x2: 0.5, y2: 1 }, // centre line
  { x1: SINGLES_X, y1: 0, x2: SINGLES_X, y2: 1 }, // singles sideline (left)
  { x1: 1 - SINGLES_X, y1: 0, x2: 1 - SINGLES_X, y2: 1 }, // singles sideline (right)
] as const;

/**
 * Rotate a normalised (x, y) by `r` clockwise quarter turns — one turn maps
 * (x, y) → (1 − y, x). Shared by the dots AND the line markings so the two can
 * never drift apart as the view rotates.
 */
export const rotateNorm = (x: number, y: number, r: number): { x: number; y: number } => {
  let rx = x;
  let ry = y;
  const turns = ((r % 4) + 4) % 4;
  for (let k = 0; k < turns; k++) {
    const nx = 1 - ry;
    const ny = rx;
    rx = nx;
    ry = ny;
  }
  return { x: rx, y: ry };
};

/** A pixel-space line segment. */
export interface PixelSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The court lines rotated by `r` quarter turns and scaled to a `w × h` box —
 * ready to hand to SVG `<Line>`. Each endpoint runs through `rotateNorm`, so
 * the schematic turns with the same mapping as the dots.
 */
export const courtLinePixels = (r: number, w: number, h: number): PixelSeg[] =>
  COURT_LINES.map((s) => {
    const a = rotateNorm(s.x1, s.y1, r);
    const b = rotateNorm(s.x2, s.y2, r);
    return { x1: a.x * w, y1: a.y * h, x2: b.x * w, y2: b.y * h };
  });
