/**
 * Which horizontal edges of a scrolling strip should fade, to hint that more
 * content lies past them. A pure function of the scroll offset and the content
 * vs. container widths, so a view can drive the "there's more →" affordance off
 * layout/scroll events and a host test can assert the logic directly.
 *
 * A small epsilon absorbs sub-pixel rounding, so a strip scrolled fully to an
 * end doesn't flicker a 1px fade there.
 */
export interface EdgeFades {
  left: boolean;
  right: boolean;
}

const EPS = 1;

export const edgeFades = (
  offsetX: number,
  contentW: number,
  containerW: number,
): EdgeFades => {
  // Nothing overflows — the whole strip is visible, so no edge continues.
  if (contentW - containerW <= EPS) return { left: false, right: false };
  return {
    left: offsetX > EPS, // scrolled past the start → more to the left
    right: offsetX + containerW < contentW - EPS, // more to the right
  };
};
