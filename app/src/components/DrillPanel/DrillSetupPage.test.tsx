import { fireEvent, render, screen } from "@testing-library/react-native";

import { DEFAULT_SETTINGS } from "../../state/AppState";
import { DrillSetupPage } from "./DrillSetupPage";

// The page is plain content now (the navigator drives its push), so it renders
// standalone — no `visible`/Modal wrapper. These props mirror what DrillPanel
// threads into the pushed route.
const setup = (overrides: Record<string, unknown> = {}) => {
  const props = {
    onDone: jest.fn(),
    onModeInfo: jest.fn(),
    uiMode: "random" as const,
    setUiMode: jest.fn(),
    stopBy: "count" as const,
    setStopBy: jest.fn(),
    count: 10,
    setCount: jest.fn(),
    durationMs: 30000,
    setDurationMs: jest.fn(),
    settings: DEFAULT_SETTINGS,
    onSettingsChange: jest.fn(),
    ...overrides,
  };
  render(<DrillSetupPage {...props} />);
  return props;
};

test("random mode shows the mode selector, stop-by and the hits wheel", () => {
  setup();
  expect(screen.getByText("Drill setup")).toBeTruthy();
  expect(screen.getByText("Session length")).toBeTruthy();
  expect(screen.getByText("Targets to hit")).toBeTruthy();
});

test("stop-by time swaps the hits wheel for the duration wheel", () => {
  setup({ stopBy: "time" });
  expect(screen.queryByText("Targets to hit")).toBeNull();
  expect(screen.getByText("Duration")).toBeTruthy();
});

test("path/live modes hide the Random params — only a court-authoring hint", () => {
  setup({ uiMode: "path" });
  expect(screen.queryByText("Session length")).toBeNull();
  expect(screen.getByText(/Tap the paired spots/)).toBeTruthy();
});

test("picking a mode reports it; the info icon and Done fire their callbacks", () => {
  const p = setup();
  fireEvent.press(screen.getByText("Path"));
  expect(p.setUiMode).toHaveBeenCalledWith("path");
  fireEvent.press(screen.getByTestId("mode-info-button"));
  expect(p.onModeInfo).toHaveBeenCalled();
  // The corner close icon is gone — a bottom Done button pops the screen instead.
  expect(screen.queryByTestId("drill-settings-close")).toBeNull();
  fireEvent.press(screen.getByTestId("drill-settings-done"));
  expect(p.onDone).toHaveBeenCalled();
});

// The session-wide drill settings (delay + immediate repeat) moved onto this
// page under a divider — the Settings tab became History. Toggling the repeat
// switch reports the changed settings up to the caller.
test("the drill settings live on the page and edit through onSettingsChange", () => {
  const p = setup();
  expect(screen.getByText("Delay between targets")).toBeTruthy();
  expect(screen.getByText("Same target twice in a row")).toBeTruthy();

  fireEvent(screen.getByTestId("repeat-switch"), "valueChange", true);
  expect(p.onSettingsChange).toHaveBeenCalledWith({
    ...DEFAULT_SETTINGS,
    allowImmediateRepeat: true,
  });
});
