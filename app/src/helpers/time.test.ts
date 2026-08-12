import { formatSessionTime } from "./time";

// A fixed LOCAL reference so the calendar-day tiers are deterministic regardless
// of the runner's timezone (all dates below are built in local time too).
const NOW = new Date(2024, 2, 15, 14, 30).getTime(); // 2024-03-15 14:30 local

test("today shows the 24h time only — no date, no relative wording", () => {
  expect(formatSessionTime(new Date(2024, 2, 15, 9, 5).getTime(), NOW)).toBe(
    "09:05",
  );
  expect(formatSessionTime(new Date(2024, 2, 15, 0, 0).getTime(), NOW)).toBe(
    "00:00",
  );
  expect(formatSessionTime(NOW, NOW)).toBe("14:30");
});

test("the previous calendar day reads 'yesterday'", () => {
  expect(formatSessionTime(new Date(2024, 2, 14, 23, 59).getTime(), NOW)).toBe(
    "yesterday",
  );
  expect(formatSessionTime(new Date(2024, 2, 14, 0, 0).getTime(), NOW)).toBe(
    "yesterday",
  );
});

test("older than yesterday falls back to dd.mm.yyyy (zero-padded)", () => {
  expect(formatSessionTime(new Date(2024, 2, 13, 12, 0).getTime(), NOW)).toBe(
    "13.03.2024",
  );
  expect(formatSessionTime(new Date(2023, 0, 5, 8, 0).getTime(), NOW)).toBe(
    "05.01.2023",
  );
});

test("a future timestamp (clock skew) counts as today, reading as a time", () => {
  expect(formatSessionTime(new Date(2024, 2, 15, 16, 0).getTime(), NOW)).toBe(
    "16:00",
  );
});

test("it never emits a relative 'ago'/'just now' label", () => {
  for (const t of [
    new Date(2024, 2, 15, 9, 0).getTime(),
    new Date(2024, 2, 14, 9, 0).getTime(),
    new Date(2024, 2, 1, 9, 0).getTime(),
  ]) {
    expect(formatSessionTime(t, NOW)).not.toMatch(/ago|just now/);
  }
});
