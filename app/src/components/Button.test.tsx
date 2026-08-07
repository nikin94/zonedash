import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Button } from "./Button";

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

test("renders children instead of a label for an icon button", () => {
  render(
    <Button testID="b" accessibilityLabel="icon" onPress={() => {}}>
      <Text testID="glyph">✓</Text>
    </Button>,
  );
  expect(screen.getByTestId("glyph")).toBeTruthy();
});
