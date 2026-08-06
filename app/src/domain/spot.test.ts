import { SPOT_CODES, SPOT_ROW_COL, spotKey } from "./spot";

test("eight canonical spots, none in the non-existent mid-centre", () => {
  expect(SPOT_ROW_COL).toHaveLength(8);
  // The court centre is the info block — the mid row has only L/R.
  expect(SPOT_ROW_COL.some((s) => s.row === "M" && s.col === "C")).toBe(false);
});

test("spotKey serialises a (row, col) pair to its two-letter code", () => {
  expect(spotKey({ row: "B", col: "L" })).toBe("BL");
  expect(spotKey({ row: "F", col: "R" })).toBe("FR");
});

test("SPOT_CODES is derived from the stored (row, col) keys — no drift", () => {
  expect(SPOT_CODES).toEqual(SPOT_ROW_COL.map(spotKey));
  // Anchors from the geometry order (clockwise from net-left).
  expect(SPOT_CODES[0]).toBe("FL"); // net left
  expect(SPOT_CODES[3]).toBe("MR"); // mid right
  expect(SPOT_CODES[6]).toBe("BL"); // back left
});
