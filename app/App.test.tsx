import { fireEvent, render, screen } from "@testing-library/react-native";
import { act } from "react";

import App from "./App";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("renders the shell with the disconnected state", () => {
  render(<App />);
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("Central unit: not connected")).toBeTruthy();
  expect(screen.getByText("Connect")).toBeTruthy();
});

test("connect button drives the mock transport to connected", async () => {
  render(<App />);
  fireEvent.press(screen.getByText("Connect"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Central unit: connected (mock)")).toBeTruthy();
  expect(screen.getByText("Disconnect")).toBeTruthy();
});

test("header settings button opens the settings screen and back preserves state", async () => {
  render(<App />);
  fireEvent.press(screen.getByText("Connect"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });

  // Gear opens settings: drill params live there, main content is hidden.
  fireEvent.press(screen.getByTestId("settings-button"));
  expect(screen.getByText("Drill settings")).toBeTruthy();
  expect(screen.getByText("Delay between targets")).toBeTruthy();
  expect(screen.getByText("Timeout (auto-miss)")).toBeTruthy();
  expect(screen.getByText("Same target twice in a row")).toBeTruthy();

  // Edit a setting, close — the main screen is back, still connected.
  fireEvent.press(screen.getByLabelText("Increase Timeout (auto-miss)"));
  fireEvent.press(screen.getByTestId("settings-button"));
  expect(screen.queryByText("Drill settings")).toBeNull();
  expect(screen.getByText("Central unit: connected (mock)")).toBeTruthy();

  // Reopen: the edited value survived (App owns the settings state).
  fireEvent.press(screen.getByTestId("settings-button"));
  expect(screen.getByText("0.5 s")).toBeTruthy();
});

test("disconnect returns to the idle state", async () => {
  render(<App />);
  fireEvent.press(screen.getByText("Connect"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  fireEvent.press(screen.getByText("Disconnect"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByText("Central unit: not connected")).toBeTruthy();
});
