import { StyleSheet, Switch, View } from "react-native";

import { AppText } from "../components/AppText";
import { Header } from "../components/Header";
import { msOptions, WheelField } from "../components/WheelField";
import { useAppState, type DrillSettings } from "../state/AppState";
import { colors } from "../theme";

// 0.1 s resolution for fine-tuning; 0 keeps its named meaning.
const DELAY_OPTIONS = msOptions(0, 5000, 100, "none");

/**
 * Drill settings panel (pushed from the header's settings button). No timeout
 * setting on purpose — the app never arms auto-miss, so a run counts hits only.
 */
export const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: DrillSettings;
  onChange: (next: DrillSettings) => void;
}) => (
  <View style={styles.panel}>
    <AppText size={12} color={colors.textSecondary} style={styles.heading}>
      Drill settings
    </AppText>
    <WheelField
      value={settings.delayMs}
      label="Delay between targets"
      testID="setting-delay"
      options={DELAY_OPTIONS}
      onChange={(delayMs) => onChange({ ...settings, delayMs })}
    />
    <View style={styles.paramRow}>
      <AppText color={colors.textSecondary} style={styles.paramLabel}>
        Same target twice in a row
      </AppText>
      <Switch
        value={settings.allowImmediateRepeat}
        accessibilityLabel="Allow immediate repeat"
        onValueChange={(allowImmediateRepeat) =>
          onChange({ ...settings, allowImmediateRepeat })
        }
      />
    </View>
  </View>
);

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
  panel: {
    alignSelf: "stretch",
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  paramRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  paramLabel: {
    flexShrink: 1,
  },
});
