import type { HitRecord } from "../ble/contract";
import { bestAverageSessionId, summarize, type SessionSummary } from "./session";

// A hit record with only the field the summary reads (reactionMs) that varies;
// the rest are filled with inert defaults.
const hit = (reactionMs: number, seq = 0): HitRecord => ({
  seq,
  position: 0,
  tLitUs: 0,
  tHitUs: 0,
  reactionMs,
  movementMs: 0,
  sensor: "tof",
  miss: false,
});

const META = { endedAt: 1_700_000_000_000, mode: "random", numPositions: 6 };

test("folds records into totals, average, and the best reaction", () => {
  const s = summarize([hit(300), hit(500), hit(400)], META);
  expect(s).toEqual({
    id: "1700000000000",
    endedAt: 1_700_000_000_000,
    mode: "random",
    numPositions: 6,
    attempts: 3,
    totalMs: 1200,
    avgMs: 400,
    bestMs: 300,
  });
});

test("an empty session reports null average and best, not zero", () => {
  const s = summarize([], META);
  expect(s.attempts).toBe(0);
  expect(s.totalMs).toBe(0);
  expect(s.avgMs).toBeNull(); // distinct from a real 0.00 s
  expect(s.bestMs).toBeNull();
});

test("id is the completion timestamp so entries sort and de-dupe by it", () => {
  expect(summarize([hit(100)], { ...META, endedAt: 42 }).id).toBe("42");
});

// bestAverageSessionId — the fastest-average session a history list badges.
const sess = (id: string, avgMs: number | null): SessionSummary => ({
  id,
  endedAt: Number(id),
  mode: "random",
  numPositions: 8,
  attempts: avgMs === null ? 0 : 3,
  totalMs: 0,
  avgMs,
  bestMs: avgMs,
});

test("picks the lowest-average session's id", () => {
  expect(bestAverageSessionId([sess("3", 500), sess("2", 350), sess("1", 420)])).toBe("2");
});

test("needs at least two comparable sessions — a lone one isn't a 'best'", () => {
  expect(bestAverageSessionId([])).toBeNull();
  expect(bestAverageSessionId([sess("1", 350)])).toBeNull();
});

test("ignores sessions with no attempts (null average)", () => {
  // Only one scored session remains → nothing to compare against.
  expect(bestAverageSessionId([sess("2", 400), sess("1", null)])).toBeNull();
  expect(bestAverageSessionId([sess("3", 400), sess("2", null), sess("1", 380)])).toBe("1");
});

test("a tie keeps the first (newest, since history is newest-first)", () => {
  expect(bestAverageSessionId([sess("2", 400), sess("1", 400)])).toBe("2");
});
