import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import type { RootStackParamList } from "./src/navigation";
import { DrillScreen } from "./src/screens/DrillScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PairingScreen } from "./src/screens/PairingScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { AppStateProvider } from "./src/state/AppState";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

/**
 * ZoneDash operator app. A native stack over the CentralTransport seam
 * (currently the in-app mock). Functionality is split per screen: Home is an
 * empty landing (content comes later), Pairing binds the layout (a finished
 * round hands over to Drill), Drill authors and runs the drill, Settings holds
 * the session-wide params. Screens draw their own header, so headerShown is
 * off; the native stack still provides real transitions and swipe-back.
 */
const App = () => (
  <AppStateProvider>
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Pairing" component={PairingScreen} />
        <Stack.Screen name="Drill" component={DrillScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    <StatusBar style="dark" />
  </AppStateProvider>
);

export default App;
