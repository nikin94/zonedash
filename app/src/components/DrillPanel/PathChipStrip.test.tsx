import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { PathChipStrip, type PathChipStripHandle } from "./PathChipStrip";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// FL(0) → ML(7) → BL(6): three chips, read back by their step codes.
const PATH = [0, 7, 6];

// Drive the layout/content/scroll measurements the fade math reads — jest never
// fires these with real sizes, so a test supplies them explicitly.
const layout = (width: number, height = 26) =>
  fireEvent(screen.getByTestId("path-sequence"), "layout", {
    nativeEvent: { layout: { width, height, x: 0, y: 0 } },
  });
const content = (width: number) =>
  fireEvent(
    screen.getByTestId("path-sequence"),
    "contentSizeChange",
    width,
    26,
  );
const scrollTo = (x: number) =>
  fireEvent.scroll(screen.getByTestId("path-sequence"), {
    nativeEvent: {
      contentOffset: { x },
      contentSize: {},
      layoutMeasurement: {},
    },
  });

test("renders each step as a chip", () => {
  render(<PathChipStrip path={PATH} onRemove={() => {}} />);
  expect(screen.getByTestId("path-chip-0")).toBeTruthy();
  expect(screen.getByTestId("path-chip-2")).toBeTruthy();
});

test("tapping a chip removes THAT step's index", () => {
  const onRemove = jest.fn();
  render(<PathChipStrip path={PATH} onRemove={onRemove} />);
  // The chip collapses before it removes — run the animation out.
  fireEvent.press(screen.getByTestId("path-chip-1"));
  act(() => jest.runAllTimers());
  expect(onRemove).toHaveBeenCalledWith(1);
});

// Undo removes the LAST step through the same collapse animation as a tap: the
// strip's removeLast() handle drives the final chip's slide-out, then reports
// its index once the animation completes.
test("removeLast collapses the final chip and reports its index", () => {
  const onRemove = jest.fn();
  const ref = createRef<PathChipStripHandle>();
  render(<PathChipStrip ref={ref} path={PATH} onRemove={onRemove} />);

  act(() => ref.current?.removeLast());
  expect(onRemove).not.toHaveBeenCalled(); // still sliding out
  act(() => jest.runAllTimers());
  expect(onRemove).toHaveBeenCalledWith(2); // the last of three steps
});

test("a strip that fits shows no edge fades", () => {
  render(<PathChipStrip path={PATH} onRemove={() => {}} />);
  layout(300);
  content(200); // content narrower than the strip — nothing to scroll
  expect(screen.queryByTestId("path-fade-left")).toBeNull();
  expect(screen.queryByTestId("path-fade-right")).toBeNull();
});

test("an overflowing strip fades the edge that has more content beyond it", () => {
  render(<PathChipStrip path={PATH} onRemove={() => {}} />);
  layout(200);
  content(500); // overflows: 300 px scrollable

  // At the start only the right edge hints more.
  expect(screen.queryByTestId("path-fade-left")).toBeNull();
  expect(screen.getByTestId("path-fade-right")).toBeTruthy();

  // Scrolled into the middle — both edges continue.
  scrollTo(150);
  expect(screen.getByTestId("path-fade-left")).toBeTruthy();
  expect(screen.getByTestId("path-fade-right")).toBeTruthy();

  // Scrolled to the end — only the left edge continues.
  scrollTo(300);
  expect(screen.getByTestId("path-fade-left")).toBeTruthy();
  expect(screen.queryByTestId("path-fade-right")).toBeNull();
});
