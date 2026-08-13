import { act, render, screen } from "@testing-library/react-native";

import { ReactionCallout, calloutGeometry } from "./ReactionCallout";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("calloutGeometry — leads into the court interior", () => {
  // The leader points toward the open interior so an edge target's callout
  // never runs off the court: left half → right, top half → down, mirrored.
  test("top-left target points down-right", () => {
    const g = calloutGeometry(0.1, 0.1);
    expect(g.sx).toBe(1);
    expect(g.sy).toBe(1);
  });

  test("bottom-right target points up-left", () => {
    const g = calloutGeometry(0.9, 0.9);
    expect(g.sx).toBe(-1);
    expect(g.sy).toBe(-1);
  });

  test("top-right target points down-left", () => {
    const g = calloutGeometry(0.9, 0.1);
    expect(g.sx).toBe(-1);
    expect(g.sy).toBe(1);
  });

  test("the underline is horizontal and the number sits above it", () => {
    const g = calloutGeometry(0.1, 0.1);
    // A horizontal underline: fixed width, and the number box rides just above it.
    expect(g.under.width).toBeGreaterThan(0);
    expect(g.num.top).toBeLessThan(g.under.top); // number above the underline
    expect(g.num.width).toBe(g.under.width); // centred over the same span
  });

  test("every coordinate is finite (no NaN from the rotation math)", () => {
    const g = calloutGeometry(0.5, 0.5);
    for (const seg of [g.diag, g.under, g.num]) {
      expect(Number.isFinite(seg.left)).toBe(true);
      expect(Number.isFinite(seg.top)).toBe(true);
      expect(Number.isFinite(seg.width)).toBe(true);
    }
    expect(Number.isFinite(g.diag.angle)).toBe(true);
  });
});

describe("ReactionCallout", () => {
  test("shows the reaction time in seconds", () => {
    render(
      <ReactionCallout x={0.1} y={0.1} reactionMs={420} onDone={jest.fn()} />,
    );
    expect(screen.getByTestId("reaction-callout")).toBeTruthy();
    expect(screen.getByText("0.42s")).toBeTruthy();
  });

  test("fades (in → hold → out) then prunes itself via onDone", () => {
    const onDone = jest.fn();
    render(<ReactionCallout x={0.1} y={0.1} reactionMs={20} onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled(); // still showing

    act(() => {
      jest.advanceTimersByTime(2000); // past in + hold + out
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
