import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useShallow } from "zustand/react/shallow";

import { LoginScreen } from "../screens/LoginScreen";
import { useAppStore } from "../state/AppState";
import { colors } from "../theme";

/**
 * Gates the app behind the first-run login screen. Until device-local prefs have
 * hydrated we can't know a prior choice, so a blank page (matching the app
 * background) covers that frame rather than flashing the app and then the gate.
 * Once hydrated: the login screen shows while the gate is unpassed AND no account
 * is active; otherwise the app renders. `authGatePassed` latches on the first
 * sign-in / "continue", so the gate is a one-time surface — a later sign-out
 * re-authenticates from the Account tab, never back here.
 *
 * It sits INSIDE AppStateProvider (so it can read the store) but ABOVE the
 * NavigationContainer, so the gate isn't a nav route — it replaces the whole app
 * shell until passed, and mounting the navigator is deferred until then.
 */
export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { hydrated, authStatus, authGatePassed } = useAppStore(
    useShallow((s) => ({
      hydrated: s.hydrated,
      authStatus: s.authStatus,
      authGatePassed: s.authGatePassed,
    })),
  );

  if (!hydrated) return <View style={styles.splash} />;
  if (authStatus !== "signed-in" && !authGatePassed) return <LoginScreen />;
  return <>{children}</>;
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
