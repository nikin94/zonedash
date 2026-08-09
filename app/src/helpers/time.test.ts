import { formatRelativeTime } from "./time";

const NOW = 1_700_000_000_000;
const ago = (ms: number) => formatRelativeTime(NOW - ms, NOW);

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("sub-minute reads 'just now'", () => {
  expect(ago(0)).toBe("just now");
  expect(ago(44 * SEC)).toBe("just now");
});

test("minutes and hours floor to whole units", () => {
  expect(ago(60 * SEC)).toBe("1m ago");
  expect(ago(59 * MIN + 59 * SEC)).toBe("59m ago");
  expect(ago(HOUR)).toBe("1h ago");
  expect(ago(23 * HOUR)).toBe("23h ago");
});

test("days up to a week", () => {
  expect(ago(DAY)).toBe("1d ago");
  expect(ago(6 * DAY)).toBe("6d ago");
});

test("a week or older falls back to an absolute stamp, not a relative one", () => {
  const label = ago(7 * DAY);
  expect(label).not.toMatch(/ago|just now/);
  expect(label.length).toBeGreaterThan(0);
});

test("a future timestamp (clock skew) reads 'just now', never a negative age", () => {
  expect(formatRelativeTime(NOW + 10 * MIN, NOW)).toBe("just now");
});
