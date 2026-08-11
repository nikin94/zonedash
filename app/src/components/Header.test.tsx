import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { MockCentralTransport } from "../ble/mock";
import { AppStateProvider } from "../state/AppState";
import { MockAuthProvider } from "../state/auth.mock";
import { Header } from "./Header";

// Header reads auth/connection off AppState, so it renders inside the provider
// (with injected mocks — no native module, no backend). Flush the async prefs
// hydration so its state update lands inside act.
const renderHeader = async (
  props: Partial<React.ComponentProps<typeof Header>> = {},
  auth = new MockAuthProvider(),
) => {
  const r = render(
    <AppStateProvider transport={new MockCentralTransport()} auth={auth}>
      <Header
        onOpenSettings={() => {}}
        onOpenHistory={() => {}}
        onOpenAccount={() => {}}
        {...props}
      />
    </AppStateProvider>,
  );
  await act(async () => {});
  return r;
};

test("the account button opens the account screen", async () => {
  const onOpenAccount = jest.fn();
  await renderHeader({ onOpenAccount });
  fireEvent.press(screen.getByTestId("account-button"));
  expect(onOpenAccount).toHaveBeenCalledTimes(1);
});

test("the account button reads as sign-in while signed-out", async () => {
  await renderHeader();
  expect(screen.getByLabelText("Sign in")).toBeTruthy();
});

test("the account button reflects a signed-in account after sign-in", async () => {
  const auth = new MockAuthProvider();
  await renderHeader({}, auth);
  await act(async () => {
    await auth.signInWithGoogle();
  });
  expect(screen.getByLabelText("Account, signed in")).toBeTruthy();
});
