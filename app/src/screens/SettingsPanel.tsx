import { StyleSheet, Switch, Text, View } from "react-native";

import { fmtSeconds, Stepper } from "./Stepper";

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
      <Stepper
        label="Delay between targets"
        value={settings.delayMs}
        display={settings.delayMs === 0 ? "none" : `${fmtSeconds(settings.delayMs)} s`}
        min={0}
        max={5000}
        step={500}
        onChange={(delayMs) => onChange({ ...settings, delayMs })}
      />
      <Stepper
        label="Timeout (auto-miss)"
        value={settings.timeoutMs}
        display={settings.timeoutMs === 0 ? "off" : `${fmtSeconds(settings.timeoutMs)} s`}
        min={0}
        max={10000}
        step={500}
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
