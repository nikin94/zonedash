import WheelPicker from "@quidone/react-native-wheel-picker";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

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
// Match the small Button (the Mode / Hits chips it sits among): pad 5 + text +
// 1px border ≈ 32. Used only for the dropdown's vertical offset; the pill sizes
// to content so its rendered height equals a small button's exactly.
const PILL_H = 32;

/**
 * Labelled value field opening a wheel dropdown — the same pattern as the
 * pairing count pill: one tap + a scroll replaces a run of −/+ presses, and
 * the pure-JS wheel behaves identically on iOS and Android. The dropdown is
 * an absolute overlay anchored on the pill (selected item lands where the
 * pill sits); a new settled value applies and closes it, any outside tap
 * dismisses it.
 */
export const WheelField = ({
  value,
  width = 84,
  label,
  testID,
  options,
  onChange,
}: {
  value: number;
  width?: number;
  label: string;
  testID: string;
  options: WheelOption[];
  onChange: (v: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const display = options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <View style={[styles.row, open && styles.rowOpen]}>
      <AppText color={colors.textSecondary} style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.anchor, { width }]}>
        <CustomPressable
          noFeedback
          testID={testID}
          accessibilityLabel={`${label}: ${display}, tap to change`}
          onPress={() => setOpen((v) => !v)}
          style={[styles.pill, open && styles.pillActive]}
        >
          <AppText weight="600">{display}</AppText>
        </CustomPressable>
        {open && (
          <>
            {/* Oversized invisible catcher: any tap outside dismisses. */}
            <CustomPressable
              noFeedback
              testID={`${testID}-backdrop`}
              accessibilityLabel={`Close ${label} picker`}
              onPress={() => setOpen(false)}
              style={styles.backdrop}
            />
            <View testID={`${testID}-wheel`} style={styles.dropdown}>
              <WheelPicker
                value={value}
                itemHeight={ITEM_H}
                visibleItemCount={VISIBLE}
                width={width}
                data={options}
                onValueChanged={({ item }) => {
                  // Settles only (intermediate passes go to onValueChanging):
                  // a new value applies and closes; the unchanged value keeps
                  // the wheel open for further scrolling.
                  if (item.value !== value) {
                    onChange(item.value);
                    setOpen(false);
                  }
                }}
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
    flexShrink: 1,
  },
  anchor: {
    // sizes to the pill (a small-button height); no fixed height so the field
    // never looks taller than the chips beside it.
  },
  pill: {
    // Same construction as a small Button — matching height and corner radius.
    paddingVertical: 5,
    borderRadius: 14,
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
    // Button-matched chrome: page fill, same border and rounding, soft drop
    // shadow so the values lift off the page.
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14, // matches the closed pill (a small Button), so open/closed read the same
    overflow: "hidden",
    ...glowShadow,
  },
  // WheelPicker's itemTextStyle is a third-party style prop — AppText (and its
  // size/color props) can't reach inside the lib's items.
  wheelText: {
    color: colors.text,
    fontSize: 16,
  },
  wheelOverlay: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
});
