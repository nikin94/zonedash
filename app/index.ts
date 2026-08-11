// react-native-gesture-handler MUST be the very first import in the app entry —
// react-navigation's gestures depend on it being initialised before anything
// touches the view tree.
import "react-native-gesture-handler";

import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
