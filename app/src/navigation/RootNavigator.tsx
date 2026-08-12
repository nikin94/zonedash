import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ToastHost } from "../components/Toast";
import { AccountScreen } from "../screens/AccountScreen";
import { DrillScreen } from "../screens/DrillScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { colors } from "../theme";
import { GlassTabBar } from "./GlassTabBar";
import { navigationRef, type RootTabParamList } from "./ref";

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * The app's navigation root: a three-tab footer — Account · Drill (centre,
 * default) · History — with no top header. Identity + link status once lived in
 * a header bar; the status moved onto the court (CourtStatusControl) and the
 * title was dropped, so the tab screens now own the full height. Each screen
 * clears the safe-area top itself (ScreenWrapper), and the app-wide toast is
 * anchored just below the notch here, over the whole navigator.
 *
 * CRITICAL: the AppStateProvider (which owns the CentralTransport singleton)
 * wraps this component in App.tsx, i.e. it sits ABOVE the NavigationContainer.
 * Switching tabs mounts/unmounts screens but never the provider, so the BLE link
 * is untouched by navigation. The Drill screen also rehydrates its live session
 * from the transport snapshot, so even a Drill-tab remount is seamless.
 */
export const RootNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <NavigationContainer ref={navigationRef}>
      <View style={styles.root}>
        <Tab.Navigator
          initialRouteName="Drill"
          tabBar={(props) => <GlassTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tab.Screen name="Account" component={AccountScreen} />
          <Tab.Screen name="Drill" component={DrillScreen} />
          <Tab.Screen name="History" component={HistoryScreen} />
        </Tab.Navigator>

        {/* App-wide toast, anchored just below the notch now that there is no
            header to hang it under. Its own store subscription (memoised) means a
            fired toast re-renders ONLY the toast, never this navigator. */}
        <ToastHost topOffset={insets.top + 8} />
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
