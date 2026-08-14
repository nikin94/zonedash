import { boundedPathAppend, drillSummary } from "./drillMode";

test("drillSummary reads the current setup for the Start caption", () => {
  // Random · hits — pluralises the unit.
  expect(drillSummary("random", "count", 10, 30000)).toBe("Random · 10 hits");
  expect(drillSummary("random", "count", 1, 30000)).toBe("Random · 1 hit");
  // Random · time — the duration window in seconds (matches the wheel's label).
  expect(drillSummary("random", "time", 10, 45000)).toBe("Random · 45s");
  // Path / Live carry no numeric tail — the sequence / hand-driven run has none.
  expect(drillSummary("path", "count", 10, 30000)).toBe("Path");
  expect(drillSummary("live", "count", 10, 30000)).toBe("Live");
});

test("a set player name leads the caption: name · mode · count", () => {
  // Name first, then mode, then the count — all joined by the central dot.
  expect(drillSummary("random", "count", 10, 30000, "Alex")).toBe(
    "Alex · Random · 10 hits",
  );
  expect(drillSummary("random", "time", 10, 45000, "Alex")).toBe(
    "Alex · Random · 45s",
  );
  expect(drillSummary("path", "count", 10, 30000, "Alex")).toBe("Alex · Path");
  // A blank / whitespace-only name is dropped — just mode · count remains.
  expect(drillSummary("random", "count", 10, 30000, "  ")).toBe(
    "Random · 10 hits",
  );
  expect(drillSummary("random", "count", 10, 30000, undefined)).toBe(
    "Random · 10 hits",
  );
});

// boundedPathAppend — the exact cap boundary that keeps a LoadDrill write inside
// one ATT MTU. Tested here with a tiny cap so the boundary is proven in O(1),
// not driven through hundreds of court taps (an O(n²) chip-strip re-render).
test("boundedPathAppend appends below the cap and no-ops at it", () => {
  // Below the cap → the spot is appended, in order.
  expect(boundedPathAppend([], 3, 3)).toEqual([3]);
  expect(boundedPathAppend([3, 1], 5, 3)).toEqual([3, 1, 5]);

  // Exactly at the cap → the tap is dropped, and the SAME array comes back (so
  // the caller's setState is a no-op re-render, not a fresh identical array).
  const full = [3, 1, 5];
  expect(boundedPathAppend(full, 7, 3)).toBe(full);

  // Already past the cap (a defensive case) → still a no-op, never overflows.
  const over = [3, 1, 5, 7];
  expect(boundedPathAppend(over, 0, 3)).toBe(over);
});
