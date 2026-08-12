import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountScreen } from "../screens/AccountScreen";
import { DrillScreen } from "../screens/DrillScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { ToastHost } from "../components/Toast";
import { colors } from "../theme";
import { GlassTabBar } from "./GlassTabBar";
import { navigationRef, type RootTabParamList } from "./ref";

const Tab = createBottomTabNavigator<RootTabParamList>();

// The navigator's own background follows the app token, so no default grey ever
// peeks through — including the area revealed behind a screen mid-transition.
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background },
};

/**
 * The app's navigation root: a three-tab footer — Account · Drill (centre,
 * default) · History — with no persistent header (the app-wide toast anchors
 * here directly). Each tab is its own screen; new screens slot in as nested
 * stacks under a tab without touching the others.
 *
 * The footer bar is FLOATING (`tabBarStyle.position: "absolute"`): the scenes
 * always fill full height and clear it with their own bottom padding, so showing
 * or hiding the bar (e.g. on the drill-setup page) never resizes a scene — which
 * is what kept the setup page's Done button from jumping as it slid away.
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
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <View style={styles.root}>
        <Tab.Navigator
          initialRouteName="Drill"
          tabBar={(props) => <GlassTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            tabBarStyle: { position: "absolute" },
          }}
        >
          <Tab.Screen name="Account" component={AccountScreen} />
          <Tab.Screen name="Drill" component={DrillScreen} />
          <Tab.Screen name="History" component={HistoryScreen} />
        </Tab.Navigator>

        {/* App-wide toast — the header that once hosted it is gone, so it anchors
            here at the navigation root and drops down from the top on its own
            safe-area offset (below the notch). Its own store subscription
            (memoised) means a fired toast re-renders only the toast, nothing
            else here. */}
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
