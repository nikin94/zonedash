import { ScrollView, StyleSheet } from "react-native";

import { SettingsPanel } from "../components/SettingsPanel";
import { useAppState } from "../state/AppState";
import { colors } from "../theme";

/**
 * The Settings tab — drill settings only (account moved to its own tab). No
 * timeout setting on purpose: the app never arms auto-miss, so a run counts hits.
 */
export const SettingsScreen = () => {
  const { settings, setSettings } = useAppState();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SettingsPanel settings={settings} onChange={setSettings} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 120, // clear the floating glass tab bar
  },
});
