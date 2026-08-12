import { render, screen } from "@testing-library/react-native";

import { DEFAULT_SETTINGS } from "../state/AppState";
import { colors } from "../theme";
import { SettingsPanel } from "./SettingsPanel";

// The immediate-repeat Switch used to wear RN's default off-track (a near-white
// grey) that vanished on the white page — the OFF state read as blank. It must
// now carry theme colours so OFF (visible mid-grey track) and ON (accent) both
// read at a glance.
test("the repeat switch uses theme track colours so its OFF state is visible", () => {
  render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={() => {}} />);

  // RN maps trackColor/thumbColor/ios_backgroundColor onto the native switch's
  // tint props: ON track (onTintColor), OFF track (tintColor), thumb
  // (thumbTintColor). Assert the rendered values so the OFF track is the visible
  // theme grey — not the default near-white — and ON is the accent.
  const toggle = screen.getByTestId("repeat-switch");
  expect(toggle.props.onTintColor).toBe(colors.accent); // ON track
  expect(toggle.props.tintColor).toBe(colors.border); // OFF track (incl. iOS)
  expect(toggle.props.thumbTintColor).toBe(colors.background); // thumb
});
