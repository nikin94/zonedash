import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { NumberField } from "./NumberField";

const setup = (value = 500, onChange = jest.fn()) => {
  render(
    <NumberField
      value={value}
      label="Delay between targets"
      testID="delay"
      unit="s"
      min={0}
      max={3000}
      onChange={onChange}
    />,
  );
  return { input: screen.getByTestId("delay"), onChange };
};

test("shows the stored ms value in display units (seconds), with the unit", () => {
  const { input } = setup(500);
  expect(input.props.value).toBe("0.5"); // 500 ms → 0.5 s
  expect(screen.getByText("s")).toBeTruthy();
});

// The field carries a FIXED height (matching the WheelField pill, 32) so a
// TextInput's taller intrinsic height can't stretch its row — the Hits wheel and
// this Seconds input must occupy the same vertical footprint in the setup page.
test("the field is a fixed 32px tall so it never stretches its row", () => {
  setup(500);
  const style = StyleSheet.flatten(
    screen.getByTestId("delay-field").props.style,
  );
  expect(style.height).toBe(32);
});

test("a typed value commits live in ms", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, "1.25");
  expect(onChange).toHaveBeenLastCalledWith(1250);
});

test("an over-max entry is clamped on commit", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, "9"); // 9 s → clamped to the 3 s max
  expect(onChange).toHaveBeenLastCalledWith(3000);
});

test("non-numeric text is rejected — the value doesn't change", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, "1"); // sets 1000
  fireEvent.changeText(input, "1a"); // letters dropped — keystroke ignored
  expect(input.props.value).toBe("1"); // text unchanged, no "1a"
  expect(onChange).toHaveBeenLastCalledWith(1000); // still 1 s, not corrupted
});

test("a third decimal place is rejected", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, "1.25");
  fireEvent.changeText(input, "1.256"); // 3rd decimal — dropped
  expect(input.props.value).toBe("1.25"); // held at two places
  expect(onChange).toHaveBeenLastCalledWith(1250);
});

test("clearing the field reverts to the last value on blur, not to zero", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, ""); // empty is not a number — no live commit
  expect(onChange).not.toHaveBeenCalled();

  fireEvent(input, "blur");
  expect(onChange).toHaveBeenLastCalledWith(500); // kept, not 0
  expect(input.props.value).toBe("0.5"); // reformatted back
});
