import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "./Button";
import { colors } from "../theme";

// The pressed-surface feedback is a style FUNCTION CustomPressable hands the
// Pressable — the only node in the tree whose `style` is a function. Sample it
// at a given pressed state (react-test-renderer won't toggle Pressable's own
// internal pressed state).
const styleAt = (pressed: boolean): ViewStyle => {
  const node = screen.UNSAFE_root.findAll(
    (n) => typeof n.props?.style === "function",
  )[0];
  const styleFn = node.props.style as (s: {
    pressed: boolean;
  }) => StyleProp<ViewStyle>;
  return StyleSheet.flatten(styleFn({ pressed }));
};

test("renders its label and fires onPress when enabled", () => {
  const onPress = jest.fn();
  render(<Button testID="b" label="Go" onPress={onPress} />);

  expect(screen.getByText("Go")).toBeTruthy();
  expect(screen.getByTestId("b")).toBeEnabled();
  fireEvent.press(screen.getByTestId("b"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("disabled greys out and blocks the press — visually and functionally", () => {
  const onPress = jest.fn();
  render(<Button testID="b" label="Go" disabled onPress={onPress} />);

  expect(screen.getByTestId("b")).toBeDisabled();
  fireEvent.press(screen.getByTestId("b"));
  expect(onPress).not.toHaveBeenCalled();
});

test("loading swaps the label for a spinner and blocks the press", () => {
  const onPress = jest.fn();
  render(<Button testID="b" label="Connect" loading onPress={onPress} />);

  // The label is gone, replaced by the spinner; the press is a no-op in-flight.
  expect(screen.queryByText("Connect")).toBeNull();
  expect(screen.getByTestId("b-spinner")).toBeTruthy();
  fireEvent.press(screen.getByTestId("b"));
  expect(onPress).not.toHaveBeenCalled();
});

test("renders children instead of a label for an icon button", () => {
  render(
    <Button testID="b" accessibilityLabel="icon" onPress={() => {}}>
      <Text testID="glyph">✓</Text>
    </Button>,
  );
  expect(screen.getByTestId("glyph")).toBeTruthy();
});

// A filled accent hero (primary) presses to a LIGHTER accent, not the near-white
// surface flash — so the white label never washes out against the pressed fill.
test("primary presses to a lighter accent, not the surface flash", () => {
  render(<Button testID="hero" label="Start" primary onPress={() => {}} />);

  expect(styleAt(false).backgroundColor).toBe(colors.accent); // resting
  expect(styleAt(true).backgroundColor).toBe(colors.accentPressed);
  expect(styleAt(true).backgroundColor).not.toBe(colors.surface); // not the grey flash
});

// A plain button keeps the default surface flash on press.
test("a non-primary button presses to the surface flash", () => {
  render(<Button testID="plain" label="Undo" onPress={() => {}} />);
  expect(styleAt(true).backgroundColor).toBe(colors.surface);
});
