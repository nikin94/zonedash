import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";

/**
 * Labelled numeric input — for a fine-grained setting (e.g. the target delay)
 * where free-typing a value beats scrolling a coarse wheel of fixed steps. The
 * value is STORED in base units (ms); the field shows and accepts it in display
 * units (`unit`, default seconds) via `scale` (display → base). A valid keystroke
 * commits live (clamped to [min, max]) so the value sticks even if the field
 * loses focus without a blur (e.g. the modal is tapped shut); an empty or
 * non-numeric entry commits nothing and reverts to the last good value on blur.
 * Chrome matches the WheelField pill / a small Button so the settings rows read
 * as one system.
 */
export const NumberField = ({
  value,
  label,
  testID,
  unit = "s",
  scale = 1000,
  min = 0,
  max = 5000,
  onChange,
}: {
  value: number; // base units (ms)
  label: string;
  testID: string;
  unit?: string;
  scale?: number; // base units per display unit (1000 ms per second)
  min?: number; // base units
  max?: number; // base units
  onChange: (v: number) => void;
}) => {
  // Trim trailing zeros: 500 → "0.5", 1000 → "1", 0 → "0".
  const toDisplay = (v: number) => String(Number((v / scale).toFixed(2)));
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const [text, setText] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);

  // While not focused the field mirrors the source of truth (a reset elsewhere
  // reformats it); while focused it holds exactly what was typed.
  const shown = focused ? text : toDisplay(value);

  const parse = (t: string) => parseFloat(t.replace(",", "."));

  const onText = (t: string) => {
    setText(t);
    const n = parse(t);
    if (!Number.isNaN(n)) onChange(clamp(Math.round(n * scale)));
  };

  const onBlur = () => {
    setFocused(false);
    const n = parse(text);
    // Non-numeric / empty: keep the last committed value, just reformat.
    const committed = Number.isNaN(n) ? value : clamp(Math.round(n * scale));
    onChange(committed);
    setText(toDisplay(committed));
  };

  return (
    <View style={styles.row}>
      <AppText color={colors.textSecondary} style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.field, focused && styles.fieldActive]}>
        <TextInput
          testID={testID}
          value={shown}
          onChangeText={onText}
          onFocus={() => {
            setFocused(true);
            setText(toDisplay(value));
          }}
          onBlur={onBlur}
          onSubmitEditing={onBlur}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={`${label}, in ${unit}`}
          style={styles.input}
        />
        <AppText size={13} color={colors.textMuted}>
          {unit}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    flexShrink: 1,
  },
  // Same construction as the WheelField pill / a small Button.
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  input: {
    minWidth: 44,
    padding: 0, // strip the platform default so height matches the pill
    textAlign: "right",
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
});
