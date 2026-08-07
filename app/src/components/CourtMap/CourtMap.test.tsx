import { act, render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";

import { type SpotVisual } from "../../helpers/court";
import { CourtMap } from "./CourtMap";
import { SpotIcon } from "./SpotIcon";

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

// Regression for the Start-pairing blink: all 8 dots change at once
// (off → available). Each must fade exactly once, and the fade must be an
// opacity-only animation on the native driver — a JS-driven color fade could
// slip its reset past a frame under that load and read as a double blink.
test("a mass change (Start pairing) fades each dot exactly once, natively driven", () => {
  const timing = jest.spyOn(Animated, "timing");
  const { rerender } = render(<CourtMap spots={allOff} />);

  const available = Array.from({ length: 8 }, () => "available" as SpotVisual);
  rerender(<CourtMap spots={available} />);
  expect(timing).toHaveBeenCalledTimes(8);
  for (const [, config] of timing.mock.calls) {
    expect((config as { useNativeDriver: boolean }).useNativeDriver).toBe(true);
  }

  // Letting the fades finish and re-rendering the same visuals adds nothing.
  act(() => jest.advanceTimersByTime(250));
  rerender(<CourtMap spots={[...available]} />);
  expect(timing).toHaveBeenCalledTimes(8);
  expect(screen.getAllByTestId(/spot-\d-available/)).toHaveLength(8);
});

// State glyphs: the prompted spot carries a spinner (in-progress, not a
// color), a bound spot carries a check mark; static picks carry neither.
test("active shows a spinner, bound shows a check, selected shows neither", () => {
  const spots = [...allOff];
  spots[0] = "active";
  spots[1] = "bound";
  spots[2] = "selected";
  render(<CourtMap spots={spots} />);

  expect(screen.getAllByTestId("dot-spinner")).toHaveLength(1);
  expect(screen.getAllByTestId("dot-check")).toHaveLength(1);
  expect(screen.getByTestId("spot-2-selected")).toBeTruthy();
});

// A lit exercise target ("armed") carries the radar ping, never the pairing
// spinner — a spinner would read as loading, not "react now".
test("armed shows the radar ping and no spinner", () => {
  const spots = [...allOff];
  spots[0] = "armed";
  render(<CourtMap spots={spots} />);

  expect(screen.getByTestId("dot-ping")).toBeTruthy();
  expect(screen.queryAllByTestId("dot-spinner")).toHaveLength(0);
});

// A pulsing pairing spot ("pulse") breathes with the same radar ping (a softer
// color), inviting a tap — and never shows the spinner.
test("pulse breathes with the radar ping and no spinner", () => {
  const spots = [...allOff];
  spots[0] = "pulse";
  render(<CourtMap spots={spots} />);

  expect(screen.getByTestId("spot-0-pulse")).toBeTruthy();
  expect(screen.getByTestId("dot-ping")).toBeTruthy();
  expect(screen.queryAllByTestId("dot-spinner")).toHaveLength(0);
});

// Drill-run flash: a hit flash is green with a check (same glyph as
// bound). Misses don't exist in the app — no timeout ever goes on the wire.
test("hit flashes with a check", () => {
  const spots = [...allOff];
  spots[0] = "hit";
  render(<CourtMap spots={spots} />);

  expect(screen.getByTestId("spot-0-hit")).toBeTruthy();
  expect(screen.getAllByTestId("dot-check")).toHaveLength(1);
});

// SpotIcon: a centred ring plus a court fragment derived from the spot's
// geometry — a 2-bar corner bracket for corners (FL), a single edge/side line
// for the net/back centres and mid sides (FC, MR).
test("SpotIcon builds the court fragment from the spot geometry", () => {
  const { rerender } = render(<SpotIcon spot={0} />); // FL corner → bracket
  expect(screen.getByTestId("spot-icon-0").children).toHaveLength(3); // 2 bars + ring

  rerender(<SpotIcon spot={1} />); // FC net centre → one edge line
  expect(screen.getByTestId("spot-icon-1").children).toHaveLength(2); // 1 bar + ring

  rerender(<SpotIcon spot={3} />); // MR mid side → one side line
  expect(screen.getByTestId("spot-icon-3").children).toHaveLength(2);
});
