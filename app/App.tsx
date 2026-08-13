import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthGate } from "./src/navigation/AuthGate";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { AppStateProvider } from "./src/state/AppState";
import { colors } from "./src/theme";

/**
 * ZoneDash operator app. A footer tab navigator (Account · Drill · History) over
 * the CentralTransport seam.
 *
 * Provider order is load-bearing: AppStateProvider (which owns the transport
 * singleton) wraps RootNavigator, so it sits ABOVE the NavigationContainer —
 * switching tabs never remounts the provider, so the BLE link is untouched by
 * navigation. GestureHandlerRootView + SafeAreaProvider are the navigation
 * stack's required roots.
 */
const App = () => {
  // Paint the native root-window background (shown behind the status bar / top
  // safe-area strip in edge-to-edge) from the app background token, so the top
  // area matches the app instead of the static dark config bg — and follows any
  // future theme change automatically rather than a hardcoded hex.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppStateProvider>
          {/* The first-run login gate sits above the navigator: until it is
              passed (sign in / continue), the app shell isn't mounted. */}
          <AuthGate>
            <RootNavigator />
          </AuthGate>
          <StatusBar style="dark" />
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
