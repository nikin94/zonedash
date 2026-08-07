import { StyleSheet, Switch, View } from "react-native";

import { type DrillSettings } from "../state/AppState";
import { colors } from "../theme";
import { AppText } from "./AppText";
import { NumberField } from "./NumberField";

// Delay is free-typed in seconds (0–3 s, 2 decimals) rather than scrolled — a
// wheel of 0.1 s steps was tedious for what is a single quick tweak. Stored as ms.
const DELAY_MAX_MS = 3000;

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
    <NumberField
      value={settings.delayMs}
      label="Delay between targets"
      testID="setting-delay"
      unit="s"
      min={0}
      max={DELAY_MAX_MS}
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
