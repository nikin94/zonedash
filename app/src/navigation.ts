import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

/** The app's native stack: Home is a deliberately empty landing (content
 *  comes later) — the functionality lives on its own screens. */
export type RootStackParamList = {
  Home: undefined;
  Pairing: undefined;
  Drill: undefined;
  Settings: undefined;
};

export type Nav = NativeStackNavigationProp<RootStackParamList>;
