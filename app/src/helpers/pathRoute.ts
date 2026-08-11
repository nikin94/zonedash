import { HIT, INSET, MAP_H, MAP_W } from "./court";
import { rotateNorm } from "./courtLines";
import { SPOT_XY } from "../domain/spot";
import { alpha, colors } from "../theme";

/**
 * The Path drill's route, drawn as directed curved segments between the tapped
 * spots — the visual that makes the SEQUENCE (which spot first) and REPEATS (a
 * spot reused across steps) readable at a glance, where a straight one-colour
 * highlight couldn't. Pure geometry: a view (CourtRoute) hands the output
 * straight to SVG, and a host test can assert the shape.
 *
 * Three things the curve encodes, all requested:
 *  - CURVE TOWARD THE CENTRE. Every segment bows inward, so a chord that would
 *    run straight THROUGH an unused perimeter spot (0→2 passing over spot 1)
 *    bends around it instead of hiding it under the line.
 *  - REPEATS FAN OUT. The k-th traversal of the same unordered pair alternates
 *    side and grows its bulge (toward, away, further toward, …), so a back-and-
 *    forth (1→3→1) draws two distinct arcs instead of one line drawn twice.
 *  - ORDER READS AS COLOUR + DIRECTION. Each segment fades from faint (first
 *    step) to full accent (last), and carries an arrowhead pointing along travel.
 *
 * Coordinates are in the court box's pixel space (MAP_W × MAP_H) using each
 * dot's CENTRE, and every endpoint runs through rotateNorm — the same transform
 * the dots and the line markings use — so the route turns with the view and can
 * never drift off the targets.
 */

/** Fraction of a segment's length used as the base perpendicular bulge. */
const BULGE = 0.16;
/** Arrowhead length, px. */
const ARROW = 8;
/** Fallback bulge for a degenerate same-spot segment (len ≈ 0), px. */
const SELF_BULGE = 26;

/** One drawn segment: an SVG quadratic path, an arrowhead polygon, and the
 *  order-encoding stroke colour. */
export interface RouteSeg {
  /** SVG path data — a single quadratic curve, "M x0 y0 Q cx cy x1 y1". */
  d: string;
  /** Arrowhead as an SVG polygon `points` string (three "x,y" pairs). */
  arrow: string;
  /** Stroke colour — faint for the first step, full accent for the last. */
  color: string;
}

interface Pt {
  x: number;
  y: number;
}

/** The pixel CENTRE of a canonical spot's dot, rotated with the view — the same
 *  centring the dots are positioned with (INSET + HIT/2 + fraction · span). */
const dotCentre = (spot: number, r: number): Pt => {
  const p = SPOT_XY[spot];
  const { x, y } = rotateNorm(p.x, p.y, r);
  return {
    x: INSET + HIT / 2 + x * (MAP_W - HIT - 2 * INSET),
    y: INSET + HIT / 2 + y * (MAP_H - HIT - 2 * INSET),
  };
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the drawn segments for a path (canonical spot indices, in step order).
 * `path.length - 1` segments; an empty or single-step path draws nothing.
 */
export const routeSegments = (path: number[], rotation: number): RouteSeg[] => {
  const r = ((rotation % 4) + 4) % 4;
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  const segs: RouteSeg[] = [];
  // How many times each unordered pair has been drawn, so repeats fan out.
  const seen = new Map<string, number>();
  const N = path.length - 1;

  for (let i = 0; i < N; i++) {
    const a = path[i];
    const b = path[i + 1];
    const p0 = dotCentre(a, r);
    const p2 = dotCentre(b, r);
    const mx = (p0.x + p2.x) / 2;
    const my = (p0.y + p2.y) / 2;

    // The k-th traversal of {a,b} alternates side and grows: +1, −1, +2, −2, …
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const fan = (k % 2 === 0 ? 1 : -1) * (Math.floor(k / 2) + 1);

    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const len = Math.hypot(dx, dy);

    let ctrl: Pt;
    if (len < 1) {
      // Degenerate same-spot step — a small loop toward the court centre.
      let tx = cx - mx;
      let ty = cy - my;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      ctrl = { x: mx + tx * SELF_BULGE * fan, y: my + ty * SELF_BULGE * fan };
    } else {
      // Unit normal to the segment, flipped to point toward the court centre.
      let nx = -dy / len;
      let ny = dx / len;
      if (nx * (cx - mx) + ny * (cy - my) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const bulge = BULGE * len * fan;
      ctrl = { x: mx + nx * bulge, y: my + ny * bulge };
    }

    // Fade first → last so the order reads as colour: faint start, full accent end.
    const t = N === 1 ? 1 : 0.45 + 0.55 * (i / (N - 1));
    const color = alpha(colors.accent, round(t));

    segs.push({
      d: `M ${round(p0.x)} ${round(p0.y)} Q ${round(ctrl.x)} ${round(ctrl.y)} ${round(p2.x)} ${round(p2.y)}`,
      arrow: arrowPoints(p0, ctrl, p2),
      color,
    });
  }
  return segs;
};

/** Arrowhead polygon at t≈0.62 along the quadratic, aimed down the tangent. */
const arrowPoints = (p0: Pt, c: Pt, p2: Pt): string => {
  const t = 0.62;
  const mt = 1 - t;
  // Point on the curve.
  const bx = mt * mt * p0.x + 2 * mt * t * c.x + t * t * p2.x;
  const by = mt * mt * p0.y + 2 * mt * t * c.y + t * t * p2.y;
  // Tangent (derivative) → travel direction.
  let dx = 2 * mt * (c.x - p0.x) + 2 * t * (p2.x - c.x);
  let dy = 2 * mt * (c.y - p0.y) + 2 * t * (p2.y - c.y);
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const px = -dy; // perpendicular
  const py = dx;
  const tip = { x: bx + dx * ARROW * 0.5, y: by + dy * ARROW * 0.5 };
  const back = { x: bx - dx * ARROW * 0.5, y: by - dy * ARROW * 0.5 };
  const left = { x: back.x + px * ARROW * 0.45, y: back.y + py * ARROW * 0.45 };
  const right = { x: back.x - px * ARROW * 0.45, y: back.y - py * ARROW * 0.45 };
  return `${round(tip.x)},${round(tip.y)} ${round(left.x)},${round(left.y)} ${round(right.x)},${round(right.y)}`;
};
