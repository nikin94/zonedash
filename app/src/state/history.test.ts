import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionSummary } from "../domain/session";
import {
  appendSession,
  clearHistory,
  HISTORY_CAP,
  loadHistory,
  replaceHistory,
} from "./history";

const KEY = "zonedash:history:v1";

const summary = (endedAt: number): SessionSummary => ({
  id: String(endedAt),
  endedAt,
  mode: "random",
  numPositions: 6,
  attempts: 3,
  totalMs: 1200,
  avgMs: 400,
  bestMs: 300,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("an empty store reads as no history", async () => {
  expect(await loadHistory()).toEqual([]);
});

test("append prepends newest-first and round-trips through storage", async () => {
  await appendSession(summary(1));
  const after = await appendSession(summary(2));
  expect(after.map((s) => s.endedAt)).toEqual([2, 1]); // newest first
  expect(await loadHistory()).toEqual(after); // persisted, not just returned
});

test("the log is capped — the oldest entries fall off", async () => {
  for (let i = 0; i < HISTORY_CAP + 5; i++) await appendSession(summary(i));
  const log = await loadHistory();
  expect(log).toHaveLength(HISTORY_CAP);
  expect(log[0].endedAt).toBe(HISTORY_CAP + 4); // newest kept
  expect(log.at(-1)?.endedAt).toBe(5); // entries 0..4 dropped
});

test("clear wipes the log", async () => {
  await appendSession(summary(1));
  await clearHistory();
  expect(await loadHistory()).toEqual([]);
});

test("replace swaps the whole log and caps it", async () => {
  await appendSession(summary(1));
  const many = Array.from({ length: HISTORY_CAP + 5 }, (_, i) => summary(i + 10));
  await replaceHistory(many);
  const got = await loadHistory();
  expect(got).toHaveLength(HISTORY_CAP); // capped
  expect(got[0].id).toBe("10"); // kept the first (newest) entries passed
  expect(got.some((s) => s.id === "1")).toBe(false); // old log fully replaced
});

test("a corrupt or non-array store falls back to empty, never throws", async () => {
  await AsyncStorage.setItem(KEY, "{not json");
  expect(await loadHistory()).toEqual([]);
  await AsyncStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
  expect(await loadHistory()).toEqual([]);
});
