import { fireEvent, render, screen } from "@testing-library/react-native";

import { NumberField } from "./NumberField";

const setup = (value = 500, onChange = jest.fn()) => {
  render(
    <NumberField
      value={value}
      label="Delay between targets"
      testID="delay"
      unit="s"
      min={0}
      max={5000}
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

test("a typed value commits live in ms", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, "1.25");
  expect(onChange).toHaveBeenLastCalledWith(1250);
});

test("an over-max entry is clamped on commit", () => {
  const { input, onChange } = setup(500);
  fireEvent(input, "focus");
  fireEvent.changeText(input, "9"); // 9 s → clamped to the 5 s max
  expect(onChange).toHaveBeenLastCalledWith(5000);
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
