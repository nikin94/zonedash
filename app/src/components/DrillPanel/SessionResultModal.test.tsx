import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";

import { SessionResultModal } from "./SessionResultModal";

const setup = (
  over: Partial<ComponentProps<typeof SessionResultModal>> = {},
) => {
  const onDismiss = jest.fn();
  render(
    <SessionResultModal
      visible
      onDismiss={onDismiss}
      playerName={null}
      attempts={3}
      totalMs={1200}
      avgMs={400}
      {...over}
    />,
  );
  return { onDismiss };
};

test("shows the headline numbers — hits, total time, average", () => {
  setup();
  expect(screen.getByTestId("result-hits")).toHaveTextContent("3");
  expect(screen.getByTestId("result-total")).toHaveTextContent("1.20s");
  expect(screen.getByTestId("result-average")).toHaveTextContent("0.40s");
});

test("headlines the runner name when one is set, and omits it otherwise", () => {
  setup({ playerName: "Alice" });
  expect(screen.getByTestId("session-result-player")).toHaveTextContent(
    "Alice",
  );
});

test("no name → no player line", () => {
  setup({ playerName: null });
  expect(screen.queryByTestId("session-result-player")).toBeNull();
});

test("a no-attempt run reads the average as a dash, not 0.00s", () => {
  setup({ attempts: 0, totalMs: 0, avgMs: null });
  expect(screen.getByTestId("result-hits")).toHaveTextContent("0");
  expect(screen.getByTestId("result-average")).toHaveTextContent("—");
});

test("Done and a backdrop tap both dismiss", () => {
  const { onDismiss } = setup();
  fireEvent.press(screen.getByTestId("session-result-done"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId("session-result-backdrop"));
  expect(onDismiss).toHaveBeenCalledTimes(2);
});

test("hidden when not visible", () => {
  render(
    <SessionResultModal
      visible={false}
      onDismiss={jest.fn()}
      playerName="Alice"
      attempts={3}
      totalMs={1200}
      avgMs={400}
    />,
  );
  expect(screen.queryByTestId("session-result")).toBeNull();
});
