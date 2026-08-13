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

// The bar is a filled track with the app's main colour forming a thumb under
// the active segment (and no bottom divider). Only the active tab carries the
// main-colour fill; the rest ride flush on the track.
test("fills only the active segment with the main colour, no bottom divider", () => {
  render(
    <SegmentedTabs
      tabs={TABS}
      activeKey="b"
      onChange={jest.fn()}
      testID="bar"
    />,
  );
  const active = StyleSheet.flatten(
    screen.getByTestId("segment-b").props.style,
  );
  const inactive = StyleSheet.flatten(
    screen.getByTestId("segment-a").props.style,
  );
  expect(active.backgroundColor).toBe(colors.background); // main-colour thumb
  expect(inactive.backgroundColor).toBeUndefined(); // flush on the track

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
