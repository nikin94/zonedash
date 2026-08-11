import { COURT_LINES, courtLinePixels, rotateNorm } from "./courtLines";

test("the interior markings are the five real court lines, none on the outer boundary", () => {
  // Short service, doubles long service, centre, two singles sidelines.
  expect(COURT_LINES).toHaveLength(5);
  // Nothing sits on the box border (0 / 1 on both axes at once) — that IS the
  // doubles boundary, drawn by the court box, not repeated here.
  for (const s of COURT_LINES) {
    const onBoundary = (v: number) => v === 0 || v === 1;
    expect(onBoundary(s.x1) && onBoundary(s.x2) && s.x1 === s.x2).toBe(false);
  }
});

test("the service lines sit at their real fractions of the half-court", () => {
  const [short, long] = COURT_LINES;
  // 1.98 m / 6.70 m and 5.94 m / 6.70 m — horizontal, full width.
  expect(short.y1).toBeCloseTo(0.2955, 3);
  expect(short.y1).toBe(short.y2);
  expect(long.y1).toBeCloseTo(0.8866, 3);
});

test("the centre line runs from the short service line to the back, not into the front court", () => {
  const centre = COURT_LINES[2];
  expect(centre.x1).toBe(0.5);
  expect(centre.x2).toBe(0.5);
  expect(centre.y1).toBeCloseTo(0.2955, 3); // starts at the short service line
  expect(centre.y2).toBe(1); // ends at the back boundary
});

test("rotateNorm turns a point a quarter clockwise: net-centre → right-centre", () => {
  expect(rotateNorm(0.5, 0, 1)).toEqual({ x: 1, y: 0.5 });
  expect(rotateNorm(0.5, 0, 2)).toEqual({ x: 0.5, y: 1 }); // half turn → back-centre
  expect(rotateNorm(0.5, 0, 4)).toEqual({ x: 0.5, y: 0 }); // full turn is identity
});

test("courtLinePixels scales to the box and turns a full-width line into a full-height one at 90°", () => {
  // The short service line is horizontal at r=0 (spans the width, y fixed)…
  const flat = courtLinePixels(0, 200, 400)[0];
  expect(flat.x1).toBe(0);
  expect(flat.x2).toBe(200);
  expect(flat.y1).toBeCloseTo(flat.y2, 6); // horizontal

  // …and vertical at r=1 (spans the height, x fixed) — it tracks the rotated net.
  const turned = courtLinePixels(1, 200, 400)[0];
  expect(turned.x1).toBeCloseTo(turned.x2, 6); // vertical now
  expect(Math.abs(turned.y2 - turned.y1)).toBeCloseTo(400, 6); // full height
});
