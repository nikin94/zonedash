import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { AppStateProvider, useAppStore } from "../state/AppState";
import { MockAuthProvider } from "../state/auth.mock";
import { LoginScreen } from "./LoginScreen";

// Surfaces the durable gate flag so the skip / sign-in paths are observable.
const GateFlag = () => {
  const passed = useAppStore((s) => s.authGatePassed);
  return <Text testID="passed">{passed ? "yes" : "no"}</Text>;
};

const setup = (auth = new MockAuthProvider()) =>
  render(
    <AppStateProvider auth={auth} remoteHistory={null}>
      <LoginScreen />
      <GateFlag />
    </AppStateProvider>,
  );

beforeEach(async () => {
  await AsyncStorage.clear(); // prefs are process-global — start each test clean
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test("offers Google sign-in and a continue-without-auth skip", () => {
  setup();
  expect(screen.getByText("ZoneDash")).toBeTruthy();
  expect(screen.getByTestId("login-google")).toBeTruthy();
  expect(screen.getByTestId("login-skip")).toBeTruthy();
  expect(screen.getByText("Continue offline")).toBeTruthy(); // the short skip label
});

test("continue-without-auth passes the gate without signing in", () => {
  const auth = new MockAuthProvider();
  const signIn = jest.spyOn(auth, "signInWithGoogle");
  setup(auth);
  expect(screen.getByTestId("passed")).toHaveTextContent("no");

  fireEvent.press(screen.getByTestId("login-skip"));

  expect(screen.getByTestId("passed")).toHaveTextContent("yes"); // gate passed
  expect(signIn).not.toHaveBeenCalled(); // stayed local-only
});

test("Google sign-in shows a spinner in flight, then passes the gate", async () => {
  setup(new MockAuthProvider({ latencyMs: 50 })); // hold in "signing-in"
  fireEvent.press(screen.getByTestId("login-google"));

  // In flight: the label is replaced by the spinner and the skip is blocked.
  expect(screen.getByTestId("login-google-spinner")).toBeTruthy();
  expect(screen.getByTestId("login-skip")).toBeDisabled();

  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(screen.getByTestId("passed")).toHaveTextContent("yes");
});

test("a failed sign-in surfaces an error and keeps the gate up", async () => {
  setup(new MockAuthProvider({ failSignIn: true }));
  fireEvent.press(screen.getByTestId("login-google"));
  await act(async () => {
    await jest.runAllTimersAsync();
  });

  expect(screen.getByTestId("passed")).toHaveTextContent("no"); // not passed
  expect(screen.getByText(/sign-in cancelled/i)).toBeTruthy();
});
