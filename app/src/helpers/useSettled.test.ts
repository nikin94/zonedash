import { act, renderHook } from "@testing-library/react-native";

import { useSettled } from "./useSettled";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const setup = (v: number[], k: string) =>
  renderHook(
    ({ value, key }: { value: number[]; key: string }) =>
      useSettled(value, key, 100),
    { initialProps: { value: v, key: k } },
  );

test("adopts the first value immediately — no wait on mount", () => {
  const { result } = setup([0, 4], "0,4");
  expect(result.current).toEqual([0, 4]);
});

test("defers a new value until its key has been quiet for the delay", () => {
  const { result, rerender } = setup([0, 4], "0,4");

  rerender({ value: [0, 4, 5], key: "0,4,5" });
  expect(result.current).toEqual([0, 4]); // still the last settled value

  act(() => jest.advanceTimersByTime(100));
  expect(result.current).toEqual([0, 4, 5]); // adopted after the quiet window
});

test("a burst keeps resetting the window — only the final value settles", () => {
  const { result, rerender } = setup([0, 4], "0,4");

  rerender({ value: [0, 4, 5], key: "0,4,5" });
  act(() => jest.advanceTimersByTime(60)); // partway — not yet
  rerender({ value: [0, 4, 5, 6], key: "0,4,5,6" }); // resets the timer
  act(() => jest.advanceTimersByTime(60)); // still short of a full quiet window
  expect(result.current).toEqual([0, 4]); // nothing settled during the burst

  act(() => jest.advanceTimersByTime(100));
  expect(result.current).toEqual([0, 4, 5, 6]); // only the latest settles
});
