import { drillSummary } from "./drillMode";

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
