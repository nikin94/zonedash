import { BADGE_MAX_STEPS, formatStepBadge } from "./pathBadge";

test("no steps → null (no badge)", () => {
  expect(formatStepBadge([])).toBeNull();
});

test("a single step is its own number", () => {
  expect(formatStepBadge([4])).toBe("4");
});

test("steps up to the cap join in full", () => {
  expect(formatStepBadge([1, 3])).toBe("1·3");
  expect(BADGE_MAX_STEPS).toBe(2); // the cap the test is written against
});

test("past the cap the OLDEST elide to a leading … and the newest stay", () => {
  expect(formatStepBadge([1, 3, 5])).toBe("…3·5");
  expect(formatStepBadge([1, 3, 5, 7])).toBe("…5·7");
});
