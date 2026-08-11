import { alpha, colors } from "../theme";
import { routeSegments } from "./pathRoute";

const FULL = alpha(colors.accent, 1); // the last segment's full-accent stroke

// Pull the "M x0 y0 Q cx cy x1 y1" numbers out of a segment's path data.
const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

test("an empty or single-step path draws nothing", () => {
  expect(routeSegments([], 0)).toEqual([]);
  expect(routeSegments([0], 0)).toEqual([]);
});

test("a path of N spots makes N-1 curved segments, each a quadratic", () => {
  const segs = routeSegments([0, 2, 4], 0);
  expect(segs).toHaveLength(2);
  for (const s of segs) {
    expect(s.d).toMatch(/^M [\d.]+ [\d.]+ Q [\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
    expect(s.arrow.split(" ")).toHaveLength(3); // three polygon points
  }
});

test("the order reads as colour: first segment faint, last full accent", () => {
  const segs = routeSegments([0, 1, 2, 4], 0);
  // The last segment is the full accent; the first is a faded accent (different).
  expect(segs.at(-1)!.color).toBe(FULL);
  expect(segs[0].color).not.toBe(FULL);
});

test("a two-spot path's single segment is full accent (nothing to fade against)", () => {
  const [seg] = routeSegments([0, 4], 0);
  expect(seg.color).toBe(FULL);
});

test("rotation moves the drawn coordinates (route turns with the view)", () => {
  const flat = nums(routeSegments([0, 2], 0)[0].d);
  const turned = nums(routeSegments([0, 2], 1)[0].d);
  expect(turned).not.toEqual(flat); // same spots, different pixels at 90°
});

test("a back-and-forth reuse fans out — the two arcs bow to opposite sides", () => {
  // 1 → 3 → 1: the pair {1,3} is traversed twice; their control points must
  // land on opposite sides of the chord, so the arcs don't draw as one line.
  const segs = routeSegments([1, 3, 1], 0);
  expect(segs).toHaveLength(2);
  // nums(d) = [x0, y0, cx, cy, x1, y1]. Endpoints are just swapped, so the chord
  // midpoint is shared; the control x (index 2) sits on opposite sides of it.
  const a = nums(segs[0].d);
  const b = nums(segs[1].d);
  const midX = (a[0] + a[4]) / 2; // (x0 + x1) / 2
  expect(Math.sign(a[2] - midX)).toBe(-Math.sign(b[2] - midX));
});
