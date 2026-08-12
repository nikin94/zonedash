import { act, render, screen } from "@testing-library/react-native";

import {
  dismissToast,
  getToast,
  showToast,
  TOAST_DEFAULT_MS,
} from "../../state/toast";
import { shouldSwipeDismiss, ToastHost } from "./ToastHost";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => dismissToast());
  jest.useRealTimers();
});

// Long enough to run any pending timer PLUS the exit animation + its callback.
const settle = () => act(() => jest.advanceTimersByTime(TOAST_DEFAULT_MS + 1000));

test("renders nothing until a toast is fired", () => {
  render(<ToastHost />);
  expect(screen.queryByTestId("toast")).toBeNull();
});

test("a fired toast renders its message; it auto-dismisses after its duration", () => {
  render(<ToastHost />);

  act(() => {
    showToast("Session complete");
  });
  expect(screen.getByTestId("toast")).toBeTruthy();
  expect(screen.getByText("Session complete")).toBeTruthy();

  // Just before the window it is still up…
  act(() => jest.advanceTimersByTime(TOAST_DEFAULT_MS - 50));
  expect(screen.queryByTestId("toast")).toBeTruthy();

  // …and after the window (plus the exit animation) it's gone from screen AND store.
  settle();
  expect(screen.queryByTestId("toast")).toBeNull();
  expect(getToast()).toBeNull();
});

test("a custom durationMs controls how long the toast stays up", () => {
  render(<ToastHost />);
  act(() => {
    showToast("Quick", { durationMs: 1000 });
  });

  act(() => jest.advanceTimersByTime(900));
  expect(screen.queryByTestId("toast")).toBeTruthy(); // still up before 1000 ms

  act(() => jest.advanceTimersByTime(1000)); // past its window + exit
  expect(screen.queryByTestId("toast")).toBeNull();
});

test("a newer toast replaces the one on screen", () => {
  render(<ToastHost />);
  act(() => {
    showToast("first");
  });
  act(() => {
    showToast("second");
  });
  expect(screen.getByText("second")).toBeTruthy();
  expect(screen.queryByText("first")).toBeNull();
  settle();
});

// The swipe threshold is pure and unit-tested; the PanResponder plumbing that
// feeds it real gesture dy/vy is device-verified.
test("shouldSwipeDismiss fires on a decisive upward flick, not a small/downward drag", () => {
  expect(shouldSwipeDismiss(-40, 0)).toBe(true); // dragged well up
  expect(shouldSwipeDismiss(0, -1.2)).toBe(true); // fast upward velocity
  expect(shouldSwipeDismiss(-10, -0.1)).toBe(false); // small nudge — springs back
  expect(shouldSwipeDismiss(30, 1)).toBe(false); // downward drag never dismisses
});
