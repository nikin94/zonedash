import WheelPicker from "@quidone/react-native-wheel-picker";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";

export interface WheelOption {
  value: number;
  label: string;
}

/** Build evenly stepped millisecond options, labelled in seconds. */
export const msOptions = (
  min: number,
  max: number,
  step: number,
  zeroLabel?: string,
): WheelOption[] => {
  const out: WheelOption[] = [];
  for (let v = min; v <= max; v += step) {
    out.push({
      value: v,
      label:
        v === 0 && zeroLabel != null
          ? zeroLabel
          : v % 1000 === 0
            ? `${v / 1000} s`
            : `${(v / 1000).toFixed(1)} s`,
    });
  }
  return out;
};

const ITEM_H = 36;
const VISIBLE = 3;
const WHEEL_H = ITEM_H * VISIBLE;
const PAD_V = 6;
const PILL_H = 36;

/**
 * Labelled value field opening a wheel dropdown — the same pattern as the
 * pairing count pill: one tap + a scroll replaces a run of −/+ presses, and
 * the pure-JS wheel behaves identically on iOS and Android. The dropdown is
 * an absolute overlay anchored on the pill (selected item lands where the
 * pill sits); a new settled value applies and closes it, any outside tap
 * dismisses it.
 */
export const WheelField = ({
  label,
  value,
  options,
  onChange,
  testID,
  width = 84,
}: {
  label: string;
  value: number;
  options: WheelOption[];
  onChange: (v: number) => void;
  testID: string;
  width?: number;
}) => {
  const [open, setOpen] = useState(false);
  const display = options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <View style={[styles.row, open && styles.rowOpen]}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={[styles.anchor, { width }]}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display}, tap to change`}
          onPress={() => setOpen((v) => !v)}
          style={[styles.pill, open && styles.pillActive]}
        >
          <AppText style={styles.pillLabel}>{display}</AppText>
        </Pressable>
        {open && (
          <>
            {/* Oversized invisible catcher: any tap outside dismisses. */}
            <Pressable
              testID={`${testID}-backdrop`}
              accessibilityLabel={`Close ${label} picker`}
              style={styles.backdrop}
              onPress={() => setOpen(false)}
            />
            <View testID={`${testID}-wheel`} style={styles.dropdown}>
              <WheelPicker
                data={options}
                value={value}
                onValueChanged={({ item }) => {
                  // Settles only (intermediate passes go to onValueChanging):
                  // a new value applies and closes; the unchanged value keeps
                  // the wheel open for further scrolling.
                  if (item.value !== value) {
                    onChange(item.value);
                    setOpen(false);
                  }
                }}
                itemHeight={ITEM_H}
                visibleItemCount={VISIBLE}
                width={width}
                itemTextStyle={styles.wheelText}
                overlayItemStyle={styles.wheelOverlay}
              />
            </View>
          </>
        )}
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
  rowOpen: {
    zIndex: 10, // the dropdown must overlay the rows below
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    flexShrink: 1,
  },
  anchor: {
    height: PILL_H,
  },
  pill: {
    height: PILL_H,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  backdrop: {
    position: "absolute",
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
  },
  dropdown: {
    // Centered on the pill so the selected item lands where the pill is.
    position: "absolute",
    top: -((WHEEL_H - PILL_H) / 2 + PAD_V + 1),
    left: -1, // border compensation — wheel width matches the pill width
    paddingVertical: PAD_V,
    // Button-matched chrome: black fill, same border and rounding, soft white
    // glow so the values separate from the dark background.
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    overflow: "hidden",
    ...glowShadow,
  },
  wheelText: {
    color: colors.text,
    fontSize: 16,
  },
  wheelOverlay: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
});
