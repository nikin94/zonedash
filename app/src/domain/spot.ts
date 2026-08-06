/**
 * Canonical court-spot identity — the durable key for storing per-spot stats.
 *
 * A spot is a FIXED point on the half-court, independent of which physical
 * target (MAC) stands there and independent of the pairing round's bind order.
 * That stability is what makes "back-left over the last month" an aggregatable
 * query: BL means the same physical point in every session, whereas a
 * bind-order slot index (HitRecord.position) points at a different place each
 * round.
 *
 * The identity is a (row, col) PAIR, not a flat 0..7 number: two small enums
 * parse trivially and the 3×3 grid's hole is expressed naturally — the mid row
 * has no centre (the court centre is the info block), so MC does not exist and
 * there are 8 spots, not 9.
 *
 * Storage rule: persist the (row, col) key, NOT the raw slot index. A slot is a
 * wire detail — meaningless without its session's pairing map. Translate
 * position → canonical spot on save via that session's pairedSpots (the same
 * inverse the map render already does).
 */

/** Human names for the canonical spots, for prompts and screen readers. */
export const SPOT_NAMES = [
  "net left",
  "net centre",
  "net right",
  "mid right",
  "back right",
  "back centre",
  "back left",
  "mid left",
] as const;

/**
 * Canonical spot geometry as normalised (x, y) in [0, 1], NET at the TOP — the
 * same layout the HUB75 panel draws (display-ui.md "layout map"), so the phone
 * and the LED display always light the same dot. Clockwise from net-left:
 *   0 ─ 1 ─ 2   ← net line
 *   7       3
 *   6 ─ 5 ─ 4   ← back line
 * A view (CourtMap, SpotIcon) scales these to pixels; the numbers themselves
 * are a spot fact, not a render detail.
 */
export const SPOT_XY = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 0.5 },
  { x: 1, y: 1 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0.5 },
] as const;

export const SPOT_ROWS = ["F", "M", "B"] as const; // front (net) / mid / back
export const SPOT_COLS = ["L", "C", "R"] as const; // left / centre / right

export type SpotRow = (typeof SPOT_ROWS)[number];
export type SpotCol = (typeof SPOT_COLS)[number];

/** A canonical spot: which row, which column. The storage key. */
export interface CanonicalSpot {
  row: SpotRow;
  col: SpotCol;
}

/** Two-letter string form, e.g. "BL" — the compact label + serialised key. */
export type SpotKey = `${SpotRow}${SpotCol}`;

/**
 * Canonical spot per geometry index — SPOT_XY order (above), clockwise from
 * net-left. The mid row has only L/R; its centre (MC) is the court's info
 * block, so eight spots, not nine.
 */
export const SPOT_ROW_COL: readonly CanonicalSpot[] = [
  { row: "F", col: "L" }, // 0 net left
  { row: "F", col: "C" }, // 1 net centre
  { row: "F", col: "R" }, // 2 net right
  { row: "M", col: "R" }, // 3 mid right
  { row: "B", col: "R" }, // 4 back right
  { row: "B", col: "C" }, // 5 back centre
  { row: "B", col: "L" }, // 6 back left
  { row: "M", col: "L" }, // 7 mid left
] as const;

/** The (row, col) key → its two-letter string form (e.g. {B,L} → "BL"). */
export const spotKey = (s: CanonicalSpot): SpotKey => `${s.row}${s.col}`;

/**
 * Two-letter code per geometry index — the single source SPOT_CODES derives
 * from, so the display label and the storage key can never drift.
 */
export const SPOT_CODES: readonly SpotKey[] = SPOT_ROW_COL.map(spotKey);
