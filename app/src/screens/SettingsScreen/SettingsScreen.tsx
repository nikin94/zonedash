import { StyleSheet, View } from "react-native";

import { Header } from "../../components/Header";
import { useAppState } from "../../state/AppState";
import { colors } from "../../theme";
import { SettingsPanel } from "./SettingsPanel";

/** The Settings screen: Header (config-only, no connection chip) + the drill
 *  settings panel. */
export const SettingsScreen = () => {
  const { settings, setSettings } = useAppState();
  return (
    <View style={styles.screen}>
      <Header back hideChip title="Settings" />
      <SettingsPanel settings={settings} onChange={setSettings} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56, // clears the status bar without a safe-area dependency
  },
});
