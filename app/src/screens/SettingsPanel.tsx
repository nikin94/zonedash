import { StyleSheet, Switch, Text, View } from "react-native";

import { msOptions, WheelField } from "./WheelField";

/**
 * Session-wide drill settings, lifted out of the drill builder so they live
 * behind the header's settings screen. The builder reads them when composing
 * the LoadDrill config; which of them actually go on the wire still depends on
 * the drill mode (the engine ignores e.g. delay in Live).
 */
export interface DrillSettings {
  delayMs: number;
  timeoutMs: number; // 0 = no auto-miss
  allowImmediateRepeat: boolean;
}

export const DEFAULT_SETTINGS: DrillSettings = {
  delayMs: 0,
  timeoutMs: 0,
  allowImmediateRepeat: false,
};

// 0.1 s resolution for fine-tuning; 0 keeps its named meaning.
const DELAY_OPTIONS = msOptions(0, 5000, 100, "none");
const TIMEOUT_OPTIONS = msOptions(0, 10000, 100, "off");

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: DrillSettings;
  onChange: (next: DrillSettings) => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Drill settings</Text>
      <WheelField
        label="Delay between targets"
        testID="setting-delay"
        value={settings.delayMs}
        options={DELAY_OPTIONS}
        onChange={(delayMs) => onChange({ ...settings, delayMs })}
      />
      <WheelField
        label="Timeout (auto-miss)"
        testID="setting-timeout"
        value={settings.timeoutMs}
        options={TIMEOUT_OPTIONS}
        onChange={(timeoutMs) => onChange({ ...settings, timeoutMs })}
      />
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>Same target twice in a row</Text>
        <Switch
          accessibilityLabel="Allow immediate repeat"
          value={settings.allowImmediateRepeat}
          onValueChange={(allowImmediateRepeat) =>
            onChange({ ...settings, allowImmediateRepeat })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: "stretch",
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  heading: {
    color: "#a1a1aa",
    fontSize: 12,
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
    color: "#a1a1aa",
    fontSize: 14,
    flexShrink: 1,
  },
});
