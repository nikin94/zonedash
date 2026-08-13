import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { NumberField } from "./NumberField";
import { WheelField } from "./WheelField";

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

// The Seconds input and the Hits wheel occupy the SAME vertical footprint, so
// swapping between them (Session length → Hits ↔ Seconds) never nudges the row
// height. Both pin an explicit height; a bare TextInput's taller intrinsic
// height (what used to make the input row stand a touch higher) is overridden.
test("the number field and the wheel pill are the same fixed height", () => {
  render(
    <>
      <NumberField
        value={500}
        label="Duration"
        testID="dur"
        unit="s"
        onChange={jest.fn()}
      />
      <WheelField
        value={10}
        label="Targets to hit"
        testID="count"
        options={[{ value: 10, label: "10" }]}
        onChange={jest.fn()}
      />
    </>,
  );
  const field = StyleSheet.flatten(screen.getByTestId("dur-field").props.style);
  const pill = StyleSheet.flatten(screen.getByTestId("count").props.style);
  expect(field.height).toBe(32);
  expect(pill.height).toBe(field.height); // identical → the row never jumps
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
