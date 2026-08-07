import { StatusBar } from "expo-status-bar";

import { MainScreen } from "./src/screens/MainScreen";
import { AppStateProvider } from "./src/state/AppState";

/**
 * ZoneDash operator app. One screen over the CentralTransport seam (currently
 * the in-app mock): the court is always on screen, and connection + pairing
 * state layer the pairing surface, then the drill controls, on top of it — no
 * navigation stack. Settings opens as a modal from the header gear.
 */
const App = () => (
  <AppStateProvider>
    <MainScreen />
    <StatusBar style="dark" />
  </AppStateProvider>
);

export default App;
