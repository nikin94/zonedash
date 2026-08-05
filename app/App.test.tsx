import WheelPicker from "@quidone/react-native-wheel-picker";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { act } from "react";

import App from "./App";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const connect = async () => {
  fireEvent.press(screen.getByTestId("status-chip"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};

test("renders the shell with the disconnected state", () => {
  render(<App />);
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("offline")).toBeTruthy(); // header status chip
  expect(screen.getByText(/Not connected — tap the status/)).toBeTruthy();
});

test("tapping the status chip connects the mock transport", async () => {
  render(<App />);
  await connect();
  expect(screen.getByText("mock")).toBeTruthy(); // brief connected label
  expect(screen.getByText("Pairing")).toBeTruthy(); // sections are up
});

test("disconnect goes through the confirm dialog — No keeps the link", async () => {
  render(<App />);
  await connect();

  // Disconnect is the chip's only action → straight to the custom confirm.
  fireEvent.press(screen.getByTestId("status-chip"));
  expect(screen.getByText("Disconnect from the central unit?")).toBeTruthy();

  fireEvent.press(screen.getByText("No"));
  expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
  expect(screen.getByText("mock")).toBeTruthy(); // still connected

  // Tap outside the dialog also dismisses without disconnecting.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByTestId("disconnect-backdrop"));
  expect(screen.queryByTestId("disconnect-confirm")).toBeNull();
  expect(screen.getByText("mock")).toBeTruthy();

  // Yes actually disconnects.
  fireEvent.press(screen.getByTestId("status-chip"));
  fireEvent.press(screen.getByText("Yes"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("offline")).toBeTruthy();
});

test("header settings button opens the settings screen and back preserves state", async () => {
  render(<App />);
  await connect();

  // The custom icon button opens settings: drill params live there.
  fireEvent.press(screen.getByTestId("settings-button"));
  expect(screen.getByText("Drill settings")).toBeTruthy();
  expect(screen.getByText("Delay between targets")).toBeTruthy();
  expect(screen.getByText("Timeout (auto-miss)")).toBeTruthy();
  expect(screen.getByText("Same target twice in a row")).toBeTruthy();

  // Edit the timeout via the wheel — 0.1 s resolution.
  fireEvent.press(screen.getByTestId("setting-timeout"));
  const picker = screen.UNSAFE_getByType(WheelPicker);
  act(() => picker.props.onValueChanged({ item: { value: 700, label: "0.7 s" } }));
  expect(screen.queryByTestId("setting-timeout-wheel")).toBeNull(); // auto-closed

  // Close settings — the main screen is back, still connected.
  fireEvent.press(screen.getByTestId("settings-button"));
  expect(screen.queryByText("Drill settings")).toBeNull();
  expect(screen.getByText("mock")).toBeTruthy();

  // Reopen: the edited value survived (App owns the settings state).
  fireEvent.press(screen.getByTestId("settings-button"));
  expect(screen.getByText("0.7 s")).toBeTruthy();
});
