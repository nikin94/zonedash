import { Pressable, StyleSheet, Text, View } from "react-native";

/** Finger-sized −/+ control for a bounded numeric param. */
export function Stepper({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.paramRow}>
      <Text style={styles.paramLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={({ pressed }) => [
            styles.stepButton,
            value <= min && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stepGlyph}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{display}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={({ pressed }) => [
            styles.stepButton,
            value >= max && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stepGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const fmtSeconds = (ms: number) =>
  ms % 1000 === 0 ? `${ms / 1000}` : (ms / 1000).toFixed(1);

const styles = StyleSheet.create({
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
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "600",
  },
  stepValue: {
    color: "#fafafa",
    fontSize: 15,
    fontWeight: "600",
    minWidth: 64,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    backgroundColor: "#18181b",
  },
});
