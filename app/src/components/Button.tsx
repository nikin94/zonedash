import { type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

type ButtonSize = "regular" | "small" | "icon";

export interface ButtonProps {
  onPress: () => void;
  /** Text label. Omit and pass `children` for an icon-only button. */
  label?: string;
  children?: ReactNode;
  /** Greys the button out AND blocks the press — one prop, both effects. */
  disabled?: boolean;
  /** Destructive: red outline and red label. */
  danger?: boolean;
  /** Dashed outline — a quiet/secondary affordance (e.g. the dev shortcut). */
  dashed?: boolean;
  /** Selected/toggle state — accent fill + border + label (Mode / length chips). */
  selected?: boolean;
  /** Skip the pressed-surface flash — for selection chips that carry their own
   *  state, so a press doesn't wash their fill. */
  noFeedback?: boolean;
  size?: ButtonSize;
  /** Override the label colour (defaults to text, or red when `danger`).
   *  Ignored when `selected` — a selected chip always wears the accent label. */
  textColor?: string;
  textSize?: number;
  testID?: string;
  accessibilityLabel?: string;
  /** Layout-only overrides (flex, margins, alignment). Visuals come from props. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The single button primitive every action button AND selection chip in the app
 * routes through. Wraps CustomPressable (pressed feedback, button role) with the
 * shared chrome, a real `disabled` state (greyed out and non-interactive from
 * one prop), and a `selected` toggle state (accent fill) — so no call site
 * re-implements any of them. Only the header status chip stays separate (it has
 * its own connect/connecting/error states).
 */
export const Button = ({
  onPress,
  label,
  children,
  disabled = false,
  danger = false,
  dashed = false,
  selected = false,
  noFeedback = false,
  size = "regular",
  textColor,
  textSize = 16,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) => (
  <CustomPressable
    noFeedback={noFeedback}
    testID={testID}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled, selected }}
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.base,
      styles[size],
      danger && styles.danger,
      dashed && styles.dashed,
      selected && styles.selected,
      disabled && styles.disabled,
      style,
    ]}
  >
    {label != null ? (
      <AppText
        center
        numberOfLines={1}
        size={textSize}
        weight="600"
        color={
          selected
            ? colors.accentText
            : (textColor ?? (danger ? colors.danger : colors.text))
        }
      >
        {label}
      </AppText>
    ) : (
      children
    )}
  </CustomPressable>
);

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  // Compact vertical footprint — the label's own line height plus a small pad,
  // no oversized fixed height.
  regular: { paddingVertical: 8, paddingHorizontal: 14 },
  small: { paddingVertical: 5, paddingHorizontal: 14 },
  icon: { width: 44, paddingVertical: 8 }, // height tracks the icon + regular pad
  danger: { borderColor: colors.danger },
  dashed: { borderStyle: "dashed" },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  disabled: { opacity: 0.4 },
});
