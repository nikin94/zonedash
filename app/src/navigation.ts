import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

/** The app's native stack: Exercise is home; the rest push on top of it. */
export type RootStackParamList = {
  Exercise: undefined;
  Pairing: undefined;
  Settings: undefined;
};

export type Nav = NativeStackNavigationProp<RootStackParamList>;
