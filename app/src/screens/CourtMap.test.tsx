import { act, render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";

import { CourtMap, type SpotVisual } from "./CourtMap";

const allOff = Array.from({ length: 8 }, () => "off" as SpotVisual);

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("a spot's state change updates in place and its color fade completes", () => {
  const { rerender } = render(<CourtMap spots={allOff} />);
  expect(screen.getByTestId("spot-0-off")).toBeTruthy();

  // off → active → confirm → bound, letting each 200 ms fade run out.
  for (const next of ["active", "confirm", "bound"] as const) {
    const spots = [...allOff];
    spots[0] = next;
    rerender(<CourtMap spots={spots} />);
    expect(screen.getByTestId(`spot-0-${next}`)).toBeTruthy();
    act(() => jest.advanceTimersByTime(250));
  }
});

test("rapid state flips mid-fade don't crash or lose the final state", () => {
  const { rerender } = render(<CourtMap spots={allOff} />);
  const spots = [...allOff];
  spots[3] = "available";
  rerender(<CourtMap spots={spots} />);
  act(() => jest.advanceTimersByTime(50)); // interrupt the fade partway
  spots[3] = "bound";
  rerender(<CourtMap spots={spots} />);
  act(() => jest.advanceTimersByTime(250));
  expect(screen.getByTestId("spot-3-bound")).toBeTruthy();
});

// Regression: during a round the panel re-renders on every Status event
// (prompt / confirm / session). Dots whose state did NOT change must not
// restart their fade — that read as repeated black↔grey blinking on court.
test("re-renders with an unchanged visual don't restart a dot's fade", () => {
  const timing = jest.spyOn(Animated, "timing");
  const { rerender } = render(<CourtMap spots={allOff} />);
  expect(timing).toHaveBeenCalledTimes(0); // mount animates nothing

  // One real transition on spot 0 → exactly one fade in the whole map.
  const prompted = [...allOff];
  prompted[0] = "active";
  rerender(<CourtMap spots={prompted} />);
  act(() => jest.advanceTimersByTime(250));
  expect(timing).toHaveBeenCalledTimes(1);

  // Event storm: same visuals arrive as fresh arrays (confirm/session
  // re-renders) — no dot may start another animation.
  rerender(<CourtMap spots={[...prompted]} />);
  rerender(<CourtMap spots={[...prompted]} />);
  act(() => jest.advanceTimersByTime(250));
  expect(timing).toHaveBeenCalledTimes(1);

  // The next real transition fades exactly once more.
  const confirmed = [...prompted];
  confirmed[0] = "confirm";
  rerender(<CourtMap spots={confirmed} />);
  expect(timing).toHaveBeenCalledTimes(2);
});
