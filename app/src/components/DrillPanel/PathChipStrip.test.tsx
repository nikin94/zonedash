import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { PathChipStrip } from "./PathChipStrip";

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
  fireEvent(screen.getByTestId("path-sequence"), "contentSizeChange", width, 26);
const scrollTo = (x: number) =>
  fireEvent.scroll(screen.getByTestId("path-sequence"), {
    nativeEvent: { contentOffset: { x }, contentSize: {}, layoutMeasurement: {} },
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
