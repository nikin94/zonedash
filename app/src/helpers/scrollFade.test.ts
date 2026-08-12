import { edgeFades } from "./scrollFade";

test("a strip that fits its container fades neither edge", () => {
  expect(edgeFades(0, 100, 200)).toEqual({ left: false, right: false });
});

test("at the start of an overflowing strip only the right edge fades", () => {
  expect(edgeFades(0, 400, 200)).toEqual({ left: false, right: true });
});

test("scrolled to the middle both edges fade — content runs both ways", () => {
  expect(edgeFades(100, 400, 200)).toEqual({ left: true, right: true });
});

test("scrolled to the end only the left edge fades", () => {
  expect(edgeFades(200, 400, 200)).toEqual({ left: true, right: false });
});

test("sub-pixel offsets at an end don't flicker a fade there", () => {
  expect(edgeFades(0.4, 400, 200)).toEqual({ left: false, right: true });
  expect(edgeFades(199.6, 400, 200)).toEqual({ left: true, right: false });
});
