import { fireEvent, render, screen } from "@testing-library/react-native";

import type { AuthUser } from "../state/auth";
import { AccountSection } from "./AccountSection";

const USER: AuthUser = { id: "u1", email: "ada@zonedash.dev", name: "Ada" };

test("signed-out offers Google sign-in and fires it", () => {
  const onSignIn = jest.fn();
  render(
    <AccountSection status="signed-out" user={null} onSignIn={onSignIn} onSignOut={() => {}} />,
  );
  expect(screen.getByText("Sign in with Google")).toBeTruthy();
  expect(screen.queryByTestId("sign-out")).toBeNull();
  fireEvent.press(screen.getByTestId("sign-in-google"));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

test("signing-in disables the button and blocks a second press", () => {
  const onSignIn = jest.fn();
  render(
    <AccountSection status="signing-in" user={null} onSignIn={onSignIn} onSignOut={() => {}} />,
  );
  expect(screen.getByText("Signing in…")).toBeTruthy();
  expect(screen.getByTestId("sign-in-google")).toBeDisabled();
  fireEvent.press(screen.getByTestId("sign-in-google"));
  expect(onSignIn).not.toHaveBeenCalled();
});

test("signed-in shows the account and fires sign-out", () => {
  const onSignOut = jest.fn();
  render(
    <AccountSection status="signed-in" user={USER} onSignIn={() => {}} onSignOut={onSignOut} />,
  );
  expect(screen.getByTestId("account-name")).toHaveTextContent("Ada");
  expect(screen.getByText("ada@zonedash.dev")).toBeTruthy();
  expect(screen.queryByTestId("sign-in-google")).toBeNull();
  fireEvent.press(screen.getByTestId("sign-out"));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});
