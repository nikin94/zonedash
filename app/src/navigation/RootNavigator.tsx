import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { AccountScreen } from "../screens/AccountScreen";
import { DrillScreen } from "../screens/DrillScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { useAppStore } from "../state/AppState";
import { colors } from "../theme";
import { GlassTabBar } from "./GlassTabBar";
import { navigationRef, type RootTabParamList } from "./ref";

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * The app's navigation root: a persistent header (title + status pill) above a
 * three-tab footer — Account · Drill (centre, default) · History. Each tab is
 * its own screen; new screens slot in as nested stacks under a tab without
 * touching the others.
 *
 * CRITICAL: the AppStateProvider (which owns the CentralTransport singleton)
 * wraps this component in App.tsx, i.e. it sits ABOVE the NavigationContainer.
 * Switching tabs mounts/unmounts screens but never the provider, so the BLE link
 * is untouched by navigation. The Drill screen also rehydrates its live session
 * from the transport snapshot, so even a Drill-tab remount is seamless.
 */
export const RootNavigator = () => {
  const resetToPairing = useAppStore((s) => s.resetToPairing);

  // Re-pair from the header: reset the drill surface to pairing and jump to the
  // Drill tab so the operator sees the round they just started.
  const handleRepair = () => {
    resetToPairing();
    if (navigationRef.isReady()) navigationRef.navigate("Drill");
  };

  return (
    <NavigationContainer ref={navigationRef}>
      <View style={styles.root}>
        <AppHeader onRepair={handleRepair} />
        <Tab.Navigator
          initialRouteName="Drill"
          tabBar={(props) => <GlassTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tab.Screen name="Account" component={AccountScreen} />
          <Tab.Screen name="Drill" component={DrillScreen} />
          <Tab.Screen name="History" component={HistoryScreen} />
        </Tab.Navigator>
      </View>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
