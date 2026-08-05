import { act, render, screen } from "@testing-library/react-native";

import { CourtMap, type SpotVisual } from "./CourtMap";

const allOff = Array.from({ length: 8 }, () => "off" as SpotVisual);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("a spot's state change updates in place and its color fade completes", () => {
  const { rerender } = render(<CourtMap spots={allOff} />);
  expect(screen.getByTestId("spot-0-off")).toBeTruthy();

  // off → active → confirm → bound, letting each 250 ms fade run out.
  for (const next of ["active", "confirm", "bound"] as const) {
    const spots = [...allOff];
    spots[0] = next;
    rerender(<CourtMap spots={spots} />);
    expect(screen.getByTestId(`spot-0-${next}`)).toBeTruthy();
    act(() => jest.advanceTimersByTime(300));
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
  act(() => jest.advanceTimersByTime(300));
  expect(screen.getByTestId("spot-3-bound")).toBeTruthy();
});
