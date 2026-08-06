import { alpha, colors } from "./index";

// alpha() must expand #rgb shorthand — parsing "#fff" as one 6-digit number
// would silently produce a garbage color.
test("alpha handles both #rrggbb and #rgb shorthand", () => {
  expect(alpha("#3f3f46", 0.5)).toBe("rgba(63,63,70,0.5)");
  expect(alpha("#fff", 0.18)).toBe("rgba(255,255,255,0.18)");
  expect(alpha(colors.shadow, 1)).toBe("rgba(0,0,0,1)");
});
