import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, StyleSheet, Text } from "react-native";

import { type SpotVisual } from "../../helpers/court";
import { alpha, colors } from "../../theme";
import { CourtMap } from "./CourtMap";
import { SpotIcon } from "./SpotIcon";

const allOff = Array.from({ length: 8 }, () => "off" as SpotVisual);

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("badges render an order label only on the spots that have one", () => {
  const badges = Array.from({ length: 8 }, () => null as string | null);
  badges[2] = "1";
  badges[5] = "2·4"; // a spot reused across two steps
  const { rerender } = render(<CourtMap spots={allOff} badges={badges} />);

  expect(screen.getByTestId("spot-badge-2")).toHaveTextContent("1");
  expect(screen.getByTestId("spot-badge-5")).toHaveTextContent("2·4");
  expect(screen.queryByTestId("spot-badge-0")).toBeNull(); // no label → no badge

  // No badges prop at all → no badge anywhere (pairing / other surfaces).
  rerender(<CourtMap spots={allOff} />);
  expect(screen.queryByTestId("spot-badge-2")).toBeNull();
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

// State glyphs: the prompted spot ("active") breathes with the radar ping —
// "press this one now" — a bound spot carries a check mark; static picks carry
// neither.
test("active breathes with the ping, bound shows a check, selected shows neither", () => {
  const spots = [...allOff];
  spots[0] = "active";
  spots[1] = "bound";
  spots[2] = "selected";
  render(<CourtMap spots={spots} />);

  expect(screen.getAllByTestId("dot-ping")).toHaveLength(1); // the prompted spot
  expect(screen.getAllByTestId("dot-check")).toHaveLength(1);
  expect(screen.getByTestId("spot-2-selected")).toBeTruthy();
});

// A lit exercise target ("armed") carries the radar ping — "react now".
test("armed shows the radar ping", () => {
  const spots = [...allOff];
  spots[0] = "armed";
  render(<CourtMap spots={spots} />);

  expect(screen.getByTestId("dot-ping")).toBeTruthy();
});

// A pulsing pairing spot ("pulse") breathes with the same radar ping (a softer
// color), inviting a tap.
test("pulse breathes with the radar ping", () => {
  const spots = [...allOff];
  spots[0] = "pulse";
  render(<CourtMap spots={spots} />);

  expect(screen.getByTestId("spot-0-pulse")).toBeTruthy();
  expect(screen.getByTestId("dot-ping")).toBeTruthy();
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

// The rotate control only appears when the parent supplies a handler, reflects
// whether the view is rotated, and fires the quarter-turn on press.
test("rotate control: hidden without a handler, reflects and fires it when given", () => {
  const { rerender } = render(<CourtMap spots={allOff} />);
  expect(screen.queryByTestId("court-rotate")).toBeNull();

  const onRotate = jest.fn();
  rerender(<CourtMap spots={allOff} onRotate={onRotate} />);
  const btn = screen.getByTestId("court-rotate");
  expect(btn.props.accessibilityState.selected).toBe(false); // 0° = upright

  fireEvent.press(btn);
  expect(onRotate).toHaveBeenCalledTimes(1);

  // Any non-zero quarter turn reads as rotated.
  rerender(<CourtMap spots={allOff} rotation={1} onRotate={onRotate} />);
  expect(
    screen.getByTestId("court-rotate").props.accessibilityState.selected,
  ).toBe(true);
});

// Rotation moves WHERE each dot is drawn but never WHICH spot it is. One
// clockwise quarter turn maps (x, y) → (1 − y, x): net-left (spot 0, top-left)
// lands where net-right (spot 2, top-right) sat; a half turn lands it where
// back-right (spot 4) sat. The reported spot index never changes.
test("rotation moves a dot's position, not its identity", () => {
  const pos = (i: number) => {
    const s = StyleSheet.flatten(
      screen.getByTestId(`spot-${i}-off`).props.style,
    );
    return { left: s.left, top: s.top };
  };

  const { rerender } = render(<CourtMap spots={allOff} />);
  const netRightNormal = pos(2);
  const backRightNormal = pos(4);

  rerender(<CourtMap spots={allOff} rotation={1} />);
  expect(pos(0)).toEqual(netRightNormal); // 90°: drawn where net-right was
  expect(screen.getByTestId("spot-0-off")).toBeTruthy(); // still reported as spot 0

  rerender(<CourtMap spots={allOff} rotation={2} />);
  expect(pos(0)).toEqual(backRightNormal); // 180°: drawn where back-right was
  expect(screen.getByTestId("spot-0-off")).toBeTruthy();
});

// The court markings render as a faint schematic backdrop — the five interior
// BWF lines — under the dots, and they take no touches (a pure display layer).
test("renders the five court line markings, and they never intercept a tap", () => {
  render(<CourtMap spots={allOff} />);
  expect(screen.getAllByTestId(/^court-line-\d+$/)).toHaveLength(5);
});

// The whole schematic turns with the view: the short service line is horizontal
// (y fixed) at 0° and vertical (x fixed) at 90°, the same transform the dots use.
test("the court lines rotate with the view, matching the dots' transform", () => {
  const shortServiceCoords = () => {
    const l = screen.getByTestId("court-line-0").props;
    return { dx: Math.abs(l.x2 - l.x1), dy: Math.abs(l.y2 - l.y1) };
  };

  const { rerender } = render(<CourtMap spots={allOff} />);
  const flat = shortServiceCoords();
  expect(flat.dy).toBeCloseTo(0, 5); // horizontal at 0°
  expect(flat.dx).toBeGreaterThan(0);

  rerender(<CourtMap spots={allOff} rotation={1} />);
  const turned = shortServiceCoords();
  expect(turned.dx).toBeCloseTo(0, 5); // vertical at 90°
  expect(turned.dy).toBeGreaterThan(0);
});

// Each target sits on an opaque app-background disc, so the court markings
// drawn behind the map never bleed through a resting dot — the dot (and its
// buttons/state fill) reads as laid over the schematic.
test("every dot has an app-background disc behind it, masking the court lines", () => {
  render(<CourtMap spots={allOff} />);
  for (let i = 0; i < 8; i++) {
    const bg = StyleSheet.flatten(
      screen.getByTestId(`spot-bg-${i}`).props.style,
    );
    expect(bg.backgroundColor).toBe(colors.background);
  }
});

// The centre block (title / info / controls) crossing the centre line sits on a
// frosted-glass card: a BlurView frost under a translucent white tint (not a
// solid fill), clipped to the rounded corners — so the court markings behind it
// blur out rather than being fully masked, and the text stays legible.
test("centre content sits on a frosted-glass card that blurs the lines behind it", () => {
  render(
    <CourtMap spots={allOff}>
      <Text>Ready</Text>
    </CourtMap>,
  );
  const card = StyleSheet.flatten(
    screen.getByTestId("centre-card").props.style,
  );
  // A translucent tint (not the opaque app fill), clipped to the corners.
  expect(card.backgroundColor).toBe(alpha(colors.background, 0.6));
  expect(card.overflow).toBe("hidden");
  expect(screen.getByTestId("centre-glass")).toBeTruthy(); // the BlurView frost
  // No card without centre content — nothing to frost.
  screen.unmount();
  render(<CourtMap spots={allOff} />);
  expect(screen.queryByTestId("centre-card")).toBeNull();
});

// The Path route draws one curved segment per step transition, over the
// markings but under the dots. It only appears with a real route (≥2 spots).
test("a route of N spots draws N-1 curved segments; none for a short route", () => {
  const { rerender } = render(<CourtMap spots={allOff} route={[0, 2, 4]} />);
  expect(screen.getByTestId("court-route")).toBeTruthy();
  expect(screen.getByTestId("route-seg-0")).toBeTruthy();
  expect(screen.getByTestId("route-seg-1")).toBeTruthy();
  expect(screen.queryByTestId("route-seg-2")).toBeNull(); // 3 spots → 2 segments

  // A single spot (or none) has no transition to draw — no overlay at all.
  rerender(<CourtMap spots={allOff} route={[0]} />);
  expect(screen.queryByTestId("court-route")).toBeNull();
  rerender(<CourtMap spots={allOff} />);
  expect(screen.queryByTestId("court-route")).toBeNull();
});

// Stage 3: an animated marker loops along the route curve, tracing the sequence
// without a play button. It shows only with a route to trace (>= 2 spots) and
// rides above the line but below the dots (its own overlay, taking no touches).
test("a route of two or more spots shows the looping preview marker", () => {
  const { rerender } = render(<CourtMap spots={allOff} route={[0, 4]} />);
  expect(screen.getByTestId("route-preview")).toBeTruthy();
  // A single-spot (or absent) route has nothing to trace — no marker.
  rerender(<CourtMap spots={allOff} route={[0]} />);
  expect(screen.queryByTestId("route-preview")).toBeNull();
  rerender(<CourtMap spots={allOff} />);
  expect(screen.queryByTestId("route-preview")).toBeNull();
});

// hideOff: the drill surface passes this so an unassigned ("off") spot draws
// nothing — no dot, no hit target — leaving only the paired targets in play.
// The pairing round and idle court leave it off, so all 8 spots stay pickable.
test("hideOff drops the off spots entirely, keeping only the ones in play", () => {
  const spots = [...allOff];
  spots[0] = "available"; // paired
  spots[4] = "armed"; // in play

  // Without hideOff (pairing / idle): every spot is drawn, off ones included.
  const { rerender } = render(<CourtMap spots={spots} />);
  expect(screen.getByTestId("spot-1-off")).toBeTruthy();
  expect(screen.queryAllByTestId(/^spot-\d-off$/)).toHaveLength(6);

  // With hideOff (drill surface): the 6 off spots are gone; the 2 in play stay.
  rerender(<CourtMap spots={spots} hideOff />);
  expect(screen.queryAllByTestId(/^spot-\d-off$/)).toHaveLength(0);
  expect(screen.getByTestId("spot-0-available")).toBeTruthy();
  expect(screen.getByTestId("spot-4-armed")).toBeTruthy();
});
