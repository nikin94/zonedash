import { render, screen, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionSummary } from "../domain/session";
import { appendSession } from "../state/history";
import { HistoryPanel } from "./HistoryPanel";

const summary = (
  endedAt: number,
  over: Partial<SessionSummary> = {},
): SessionSummary => ({
  id: String(endedAt),
  endedAt,
  mode: "random",
  numPositions: 6,
  attempts: 3,
  totalMs: 1200,
  avgMs: 400,
  bestMs: 300,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("empty history shows the hint and no list — the list is pure now", async () => {
  render(<HistoryPanel />);
  expect(await screen.findByTestId("history-empty")).toBeTruthy();
  expect(screen.queryByTestId("history-list")).toBeNull();
  // The Clear action moved to the screen's overflow menu — the panel renders none.
  expect(screen.queryByText("Clear history")).toBeNull();
});

test("reports the loaded session count via onLoaded", async () => {
  const onLoaded = jest.fn();
  await appendSession(summary(1));
  await appendSession(summary(2));
  render(<HistoryPanel onLoaded={onLoaded} />);
  await screen.findByTestId("history-row-2");
  expect(onLoaded).toHaveBeenLastCalledWith(2);
});

// The panel reads the bucket for its `userId`: an account's list, not the
// device's anonymous log (nor another account's).
test("reads the given identity's bucket, not the anonymous log", async () => {
  await appendSession(summary(1)); // anonymous run
  await appendSession(summary(2), "u1"); // account u1's run

  render(<HistoryPanel userId="u1" />);
  expect(await screen.findByTestId("history-row-2")).toBeTruthy(); // u1's session
  expect(screen.queryByTestId("history-row-1")).toBeNull(); // not the anon one
});

test("lists stored sessions newest-first with mode, average and best", async () => {
  await appendSession(summary(1, { mode: "path", avgMs: 500, bestMs: 250 }));
  await appendSession(summary(2, { mode: "live" }));

  render(<HistoryPanel />);

  expect(await screen.findByTestId("history-row-2")).toBeTruthy();
  expect(screen.getByTestId("history-row-1")).toBeTruthy();
  expect(screen.getByText("Live")).toBeTruthy();
  expect(screen.getByText("Path")).toBeTruthy();
  expect(screen.getByText("0.50s")).toBeTruthy(); // no space between value and unit
  expect(screen.getByText("best 0.25s")).toBeTruthy();
});

test("shows the runner name on a session that has one, and nothing for an unnamed run", async () => {
  await appendSession(summary(1)); // unnamed
  await appendSession(summary(2, { playerName: "Alice" }));

  render(<HistoryPanel />);
  await screen.findByTestId("history-row-2");

  expect(screen.getByTestId("history-player-2")).toHaveTextContent("Alice");
  expect(screen.queryByTestId("history-player-1")).toBeNull();
});

test("the target count shows only for a reduced layout, not the full 8", async () => {
  await appendSession(summary(1, { numPositions: 6 }));
  await appendSession(summary(2, { numPositions: 8 }));

  render(<HistoryPanel />);
  await screen.findByTestId("history-row-2");

  expect(screen.getByText(/6 targets/)).toBeTruthy();
  expect(screen.queryByText(/8 targets/)).toBeNull();
});

test("the meta line reads hits BEFORE targets (targets last in the row)", async () => {
  await appendSession(summary(1, { attempts: 3, numPositions: 6 }));

  render(<HistoryPanel />);
  await screen.findByTestId("history-row-1");

  // One text node: "<when> · 3 hits · 6 targets" — hits precede targets.
  expect(screen.getByText(/3 hits · 6 targets/)).toBeTruthy();
  expect(screen.queryByText(/6 targets · 3 hits/)).toBeNull();
});

test("the meta line stamps an absolute time, never a relative 'ago' label", async () => {
  await appendSession(summary(1));

  render(<HistoryPanel />);
  const row = await screen.findByTestId("history-row-1");

  expect(within(row).queryByText(/ago|just now/)).toBeNull();
});

test("badges the fastest-average session, and only that one", async () => {
  await appendSession(summary(1, { avgMs: 500 }));
  await appendSession(summary(2, { avgMs: 320 })); // fastest
  await appendSession(summary(3, { avgMs: 410 }));

  render(<HistoryPanel />);
  await screen.findByTestId("history-row-2");

  expect(screen.getByTestId("history-best-2")).toBeTruthy();
  expect(screen.queryByTestId("history-best-1")).toBeNull();
  expect(screen.queryByTestId("history-best-3")).toBeNull();
  expect(screen.getByText("★ best")).toBeTruthy();
});

test("a lone session gets no best badge — nothing to compare against", async () => {
  await appendSession(summary(1, { avgMs: 350 }));
  render(<HistoryPanel />);
  await screen.findByTestId("history-row-1");
  expect(screen.queryByText("★ best")).toBeNull();
});

test("re-pulls the log when refreshKey changes", async () => {
  const { rerender } = render(<HistoryPanel refreshKey={0} />);
  expect(await screen.findByTestId("history-empty")).toBeTruthy();

  // A session finishes elsewhere; bumping refreshKey re-reads the store.
  await appendSession(summary(1));
  rerender(<HistoryPanel refreshKey={1} />);
  expect(await screen.findByTestId("history-row-1")).toBeTruthy();
});
