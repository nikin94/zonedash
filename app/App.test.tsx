import { render, screen } from "@testing-library/react-native";

import App from "./App";

test("renders the shell with the disconnected state", () => {
  render(<App />);
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByText("Central unit: not connected")).toBeTruthy();
});
