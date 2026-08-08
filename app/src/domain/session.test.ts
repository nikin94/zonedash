import type { HitRecord } from "../ble/contract";
import { summarize } from "./session";

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
