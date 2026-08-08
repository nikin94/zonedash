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

test("the target count shows only for a reduced layout, not the full 8", async () => {
  await appendSession(summary(1, { numPositions: 6 })); // reduced
  await appendSession(summary(2, { numPositions: 8 })); // full layout

  render(<HistoryModal visible onDismiss={() => {}} />);
  await screen.findByTestId("history-row-2");

  // A reduced layout notes its count; the full 8-target default stays silent.
  expect(screen.getByText(/6 targets/)).toBeTruthy();
  expect(screen.queryByText(/8 targets/)).toBeNull();
});

test("badges the fastest-average session, and only that one", async () => {
  await appendSession(summary(1, { avgMs: 500 }));
  await appendSession(summary(2, { avgMs: 320 })); // fastest
  await appendSession(summary(3, { avgMs: 410 }));

  render(<HistoryModal visible onDismiss={() => {}} />);
  await screen.findByTestId("history-row-2");

  expect(screen.getByTestId("history-best-2")).toBeTruthy(); // the 320 ms run
  expect(screen.queryByTestId("history-best-1")).toBeNull();
  expect(screen.queryByTestId("history-best-3")).toBeNull();
  expect(screen.getByText("★ best")).toBeTruthy();
});

test("a lone session gets no best badge — nothing to compare against", async () => {
  await appendSession(summary(1, { avgMs: 350 }));
  render(<HistoryModal visible onDismiss={() => {}} />);
  await screen.findByTestId("history-row-1");
  expect(screen.queryByText("★ best")).toBeNull();
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
