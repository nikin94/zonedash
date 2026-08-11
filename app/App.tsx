import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RootNavigator } from "./src/navigation/RootNavigator";
import { AppStateProvider } from "./src/state/AppState";

/**
 * ZoneDash operator app. A footer tab navigator (Account · Drill · Settings)
 * under a persistent header, over the CentralTransport seam.
 *
 * Provider order is load-bearing: AppStateProvider (which owns the transport
 * singleton) wraps RootNavigator, so it sits ABOVE the NavigationContainer —
 * switching tabs never remounts the provider, so the BLE link is untouched by
 * navigation. GestureHandlerRootView + SafeAreaProvider are the navigation
 * stack's required roots.
 */
const App = () => (
  <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider>
      <AppStateProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AppStateProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
