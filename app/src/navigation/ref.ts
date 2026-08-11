import { createNavigationContainerRef } from "@react-navigation/native";

/**
 * The three top-level tabs. Each is a destination today; when a tab grows
 * sub-screens it becomes a nested stack under the same name, so this list is the
 * stable spine the rest of the app navigates against.
 */
export type RootTabParamList = {
  Account: undefined;
  Drill: undefined;
  Settings: undefined;
};

/**
 * Container-level navigation ref — lets chrome rendered OUTSIDE a screen (the
 * persistent header) drive navigation without a screen's `useNavigation`. Used
 * by the header's Re-pair to jump to the Drill tab.
 */
export const navigationRef = createNavigationContainerRef<RootTabParamList>();
