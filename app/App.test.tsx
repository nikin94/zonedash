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
