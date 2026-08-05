import { fireEvent, render, screen } from "@testing-library/react-native";

import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

test("defaults to the button role and fires onPress", () => {
  const onPress = jest.fn();
  render(
    <CustomPressable testID="cp" onPress={onPress}>
      <AppText>Go</AppText>
    </CustomPressable>,
  );
  expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  fireEvent.press(screen.getByTestId("cp"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("caller props override the defaults", () => {
  render(
    <CustomPressable disabled testID="cp" accessibilityRole="none" />,
  );
  const el = screen.getByTestId("cp");
  expect(el.props.accessibilityRole).toBe("none");
  expect(el.props.accessibilityState).toMatchObject({ disabled: true });
});
