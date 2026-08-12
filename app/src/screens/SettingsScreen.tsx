import { ScrollView, StyleSheet } from "react-native";

import { ScreenWrapper } from "../components/ScreenWrapper";
import { SettingsPanel } from "../components/SettingsPanel";
import { useAppState } from "../state/AppState";

/**
 * The Settings tab — drill settings only (account moved to its own tab). No
 * timeout setting on purpose: the app never arms auto-miss, so a run counts hits.
 */
export const SettingsScreen = () => {
  const { settings, setSettings } = useAppState();
  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SettingsPanel settings={settings} onChange={setSettings} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 120, // clear the floating glass tab bar
  },
});
