import { fireEvent, render, screen } from "@testing-library/react-native";

import type { AuthUser } from "../state/auth";
import { AccountModal } from "./AccountModal";

const USER: AuthUser = { id: "u1", email: "ada@zonedash.dev", name: "Ada" };
// Shared handlers/error; a test overrides the one it asserts on AFTER the spread.
const base = {
  onDismiss: () => {},
  onSignIn: () => {},
  onSignOut: () => {},
  error: null,
};

test("a hidden modal renders nothing", () => {
  render(<AccountModal visible={false} status="signed-out" user={null} {...base} />);
  expect(screen.queryByTestId("account-section")).toBeNull();
});

test("signed-out offers Google sign-in and fires it", () => {
  const onSignIn = jest.fn();
  render(
    <AccountModal visible status="signed-out" user={null} {...base} onSignIn={onSignIn} />,
  );
  expect(screen.getByText("Sign in with Google")).toBeTruthy();
  fireEvent.press(screen.getByTestId("sign-in-google"));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

test("signing-in disables the sign-in button", () => {
  render(<AccountModal visible status="signing-in" user={null} {...base} />);
  expect(screen.getByTestId("sign-in-google")).toBeDisabled();
});

test("signed-in shows the account and fires sign-out", () => {
  const onSignOut = jest.fn();
  render(
    <AccountModal visible status="signed-in" user={USER} {...base} onSignOut={onSignOut} />,
  );
  expect(screen.getByTestId("account-name")).toHaveTextContent("Ada");
  expect(screen.queryByTestId("sign-in-google")).toBeNull();
  fireEvent.press(screen.getByTestId("sign-out"));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test("a sign-in error is surfaced, and hidden when there is none", () => {
  const { rerender } = render(
    <AccountModal visible status="signed-out" user={null} {...base} error="popup closed" />,
  );
  expect(screen.getByTestId("account-error")).toHaveTextContent(/popup closed/);

  rerender(<AccountModal visible status="signed-out" user={null} {...base} error={null} />);
  expect(screen.queryByTestId("account-error")).toBeNull();
});

test("the backdrop dismisses", () => {
  const onDismiss = jest.fn();
  render(
    <AccountModal visible status="signed-out" user={null} {...base} onDismiss={onDismiss} />,
  );
  fireEvent.press(screen.getByTestId("account-backdrop"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
