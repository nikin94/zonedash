import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { colors } from "../theme";
import { SegmentedTabs } from "./SegmentedTabs";

const TABS = [
  { key: "a", label: "Alpha" },
  { key: "b", label: "Bravo" },
  { key: "c", label: "Charlie" },
];

test("renders one segment per tab, driven entirely by the list", () => {
  render(<SegmentedTabs tabs={TABS} activeKey="a" onChange={jest.fn()} />);
  expect(screen.getByTestId("segment-a")).toBeTruthy();
  expect(screen.getByTestId("segment-b")).toBeTruthy();
  expect(screen.getByTestId("segment-c")).toBeTruthy();
  expect(screen.getByText("Alpha")).toBeTruthy();
  expect(screen.getByText("Charlie")).toBeTruthy();
});

test("marks only the active segment as selected", () => {
  render(<SegmentedTabs tabs={TABS} activeKey="b" onChange={jest.fn()} />);
  expect(
    screen.getByTestId("segment-b").props.accessibilityState.selected,
  ).toBe(true);
  expect(
    screen.getByTestId("segment-a").props.accessibilityState.selected,
  ).toBe(false);
});

test("a tap reports the segment's key through onChange", () => {
  const onChange = jest.fn();
  render(<SegmentedTabs tabs={TABS} activeKey="a" onChange={onChange} />);
  fireEvent.press(screen.getByTestId("segment-c"));
  expect(onChange).toHaveBeenCalledWith("c");
});

// The bar is a filled track with the app's main colour forming a SINGLE sliding
// thumb (not a per-segment fill), and no bottom divider. The segments themselves
// are transparent — the thumb below is the only selection fill.
test("has a main-colour sliding thumb over a filled track, no bottom divider", () => {
  render(
    <SegmentedTabs
      tabs={TABS}
      activeKey="b"
      onChange={jest.fn()}
      testID="bar"
    />,
  );
  // The thumb is the app's main colour, positioned absolutely so it can slide.
  const thumb = StyleSheet.flatten(screen.getByTestId("bar-thumb").props.style);
  expect(thumb.backgroundColor).toBe(colors.background);
  expect(thumb.position).toBe("absolute");

  // Segments carry no fill of their own — the thumb is the only selection mark.
  const seg = StyleSheet.flatten(screen.getByTestId("segment-b").props.style);
  expect(seg.backgroundColor).toBeUndefined();

  const bar = StyleSheet.flatten(screen.getByTestId("bar").props.style);
  expect(bar.backgroundColor).toBe(colors.surfaceAlt); // filled track
  expect(bar.borderBottomWidth).toBeUndefined(); // divider removed
});

test("a one-tab list still renders — no minimum count baked in", () => {
  render(
    <SegmentedTabs
      tabs={[{ key: "only", label: "Only" }]}
      activeKey="only"
      onChange={jest.fn()}
    />,
  );
  expect(screen.getByTestId("segment-only")).toBeTruthy();
});
