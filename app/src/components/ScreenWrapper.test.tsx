import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { SCREEN_PAD_TOP, ScreenWrapper } from "./ScreenWrapper";

test("renders its children", () => {
  render(
    <ScreenWrapper>
      <Text>content</Text>
    </ScreenWrapper>,
  );
  expect(screen.getByText("content")).toBeTruthy();
});

// No title → no header row (the Drill tab passes none, so its surfaces stay
// flush to the shared top offset).
test("renders no title header unless a title is given", () => {
  render(
    <ScreenWrapper>
      <Text>content</Text>
    </ScreenWrapper>,
  );
  expect(screen.queryByTestId("screen-title")).toBeNull();
});

// A title renders a big, bold heading above the content, and a headerRight node
// rides the same row (pinned right) — so titled tabs (Account, History) share
// one title style and top offset.
test("renders a big bold title and its headerRight accessory", () => {
  render(
    <ScreenWrapper title="History" headerRight={<Text>menu</Text>}>
      <Text>content</Text>
    </ScreenWrapper>,
  );
  const title = screen.getByTestId("screen-title");
  expect(title).toHaveTextContent("History");
  const style = StyleSheet.flatten(title.props.style);
  expect(style.fontSize).toBeGreaterThanOrEqual(24); // bigger than body text
  expect(style.fontWeight).toBe("700"); // bold
  expect(screen.getByText("menu")).toBeTruthy();
});

// The shared top offset lives here, once, so every tab screen sits at the same
// minimal gap below the header — and the Drill tab's three swappable surfaces
// can't drift apart. A regression that inflated or dropped it would change the
// header gap on every screen.
test("applies the single shared top offset every screen inherits", () => {
  render(
    <ScreenWrapper testID="wrap">
      <Text>content</Text>
    </ScreenWrapper>,
  );
  const style = StyleSheet.flatten(screen.getByTestId("wrap").props.style);
  expect(style.paddingTop).toBe(SCREEN_PAD_TOP);
  expect(style.flex).toBe(1);
});

// A per-screen style override merges over the shell without dropping the offset.
test("merges an override style over the shared shell", () => {
  render(
    <ScreenWrapper testID="wrap" style={{ paddingHorizontal: 12 }}>
      <Text>content</Text>
    </ScreenWrapper>,
  );
  const style = StyleSheet.flatten(screen.getByTestId("wrap").props.style);
  expect(style.paddingTop).toBe(SCREEN_PAD_TOP);
  expect(style.paddingHorizontal).toBe(12);
});
