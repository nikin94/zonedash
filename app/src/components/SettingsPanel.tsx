import { StyleSheet, Switch, View } from "react-native";

import { type DrillSettings } from "../state/AppState";
import { colors } from "../theme";
import { AppText } from "./AppText";
import { msOptions, WheelField } from "./WheelField";

// 0.1 s resolution for fine-tuning; 0 keeps its named meaning.
const DELAY_OPTIONS = msOptions(0, 5000, 100, "none");

/**
 * Drill settings panel — shown in a modal opened from the header's settings
 * gear. No timeout setting on purpose: the app never arms auto-miss, so a run
 * counts hits only.
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

const styles = StyleSheet.create({
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
