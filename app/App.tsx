import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import type { RootStackParamList } from "./src/navigation";
import { ExerciseScreen } from "./src/screens/ExerciseScreen";
import { PairingScreen } from "./src/screens/PairingScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { AppStateProvider } from "./src/state/AppState";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

/**
 * ZoneDash operator app. A native stack over the CentralTransport seam
 * (currently the in-app mock): Exercise is home — the court, the run and the
 * drill config in one place; Pairing (from the header's central-unit menu) and
 * Settings (from the header's settings button) push on top of it. Screens draw
 * their own header, so headerShown is off; the native stack still provides
 * real transitions and swipe-back.
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
        <Stack.Screen name="Exercise" component={ExerciseScreen} />
        <Stack.Screen name="Pairing" component={PairingScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    <StatusBar style="light" />
  </AppStateProvider>
);

export default App;
