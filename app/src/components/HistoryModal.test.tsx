import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionSummary } from "../domain/session";
import { appendSession, loadHistory } from "../state/history";
import { HistoryModal } from "./HistoryModal";

const summary = (endedAt: number, over: Partial<SessionSummary> = {}): SessionSummary => ({
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

test("empty history shows the hint, no list and no clear action", async () => {
  render(<HistoryModal visible onDismiss={() => {}} />);
  expect(await screen.findByTestId("history-empty")).toBeTruthy();
  expect(screen.queryByTestId("history-list")).toBeNull();
  expect(screen.queryByText("Clear history")).toBeNull();
});

test("lists stored sessions newest-first with mode, average and best", async () => {
  await appendSession(summary(1, { mode: "path", avgMs: 500, bestMs: 250 }));
  await appendSession(summary(2, { mode: "live" }));

  render(<HistoryModal visible onDismiss={() => {}} />);

  // Newest (endedAt 2) row is present, and both rows rendered.
  expect(await screen.findByTestId("history-row-2")).toBeTruthy();
  expect(screen.getByTestId("history-row-1")).toBeTruthy();
  expect(screen.getByText("Live")).toBeTruthy(); // title-cased mode
  expect(screen.getByText("Path")).toBeTruthy();
  expect(screen.getByText("0.50 s")).toBeTruthy(); // path avg
  expect(screen.getByText("best 0.25 s")).toBeTruthy(); // path best
});

test("a hidden modal loads nothing", () => {
  render(<HistoryModal visible={false} onDismiss={() => {}} />);
  expect(screen.queryByTestId("history-empty")).toBeNull();
  expect(screen.queryByTestId("history-list")).toBeNull();
});

test("the backdrop dismisses", async () => {
  const onDismiss = jest.fn();
  render(<HistoryModal visible onDismiss={onDismiss} />);
  await screen.findByTestId("history-empty");
  fireEvent.press(screen.getByTestId("history-backdrop"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("Clear history wipes the log behind a confirm", async () => {
  await appendSession(summary(1));
  render(<HistoryModal visible onDismiss={() => {}} />);
  await screen.findByTestId("history-row-1");

  fireEvent.press(screen.getByText("Clear history")); // arms the confirm only
  expect(screen.getByTestId("clear-history-confirm")).toBeTruthy();
  expect(await loadHistory()).toHaveLength(1); // not cleared yet

  fireEvent.press(screen.getByText("Clear")); // the confirm's action
  await waitFor(() => expect(screen.getByTestId("history-empty")).toBeTruthy());
  expect(await loadHistory()).toEqual([]); // wiped from storage
});
