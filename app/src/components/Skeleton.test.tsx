import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { HistoryRowSkeleton, Skeleton } from "./Skeleton";

test("a block takes its width/height/radius and carries a testID", () => {
  render(<Skeleton width={80} height={20} radius={4} testID="sk" />);
  const style = StyleSheet.flatten(screen.getByTestId("sk").props.style);
  expect(style.width).toBe(80);
  expect(style.height).toBe(20);
  expect(style.borderRadius).toBe(4);
});

// It's decorative — a screen reader must skip it, so it never announces a
// half-loaded placeholder as content.
test("a block is hidden from assistive tech", () => {
  render(<Skeleton testID="sk" />);
  expect(screen.getByTestId("sk").props.accessible).toBe(false);
});

// The row shape renders without a crash — its real coverage is in HistoryPanel,
// where it stands in for a row until the log loads.
test("the history row skeleton renders", () => {
  const { toJSON } = render(<HistoryRowSkeleton />);
  expect(toJSON()).toBeTruthy();
});
