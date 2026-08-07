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
  size?: ButtonSize;
  /** Override the label colour (defaults to text, or red when `danger`). */
  textColor?: string;
  textSize?: number;
  testID?: string;
  accessibilityLabel?: string;
  /** Layout-only overrides (flex, margins, alignment). Visuals come from props. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The single button primitive every action button in the app routes through.
 * Wraps CustomPressable (pressed feedback, button role) with the shared pill
 * chrome and a real `disabled` state — greyed out and non-interactive from one
 * prop, so no call site re-implements it. Chips/toggles and header chrome are a
 * separate selection pattern and intentionally do NOT go through here.
 */
export const Button = ({
  onPress,
  label,
  children,
  disabled = false,
  danger = false,
  dashed = false,
  size = "regular",
  textColor,
  textSize = 16,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) => (
  <CustomPressable
    testID={testID}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.base,
      styles[size],
      danger && styles.danger,
      dashed && styles.dashed,
      disabled && styles.disabled,
      style,
    ]}
  >
    {label != null ? (
      <AppText
        center
        size={textSize}
        weight="600"
        color={textColor ?? (danger ? colors.danger : colors.text)}
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  regular: { height: 48, paddingHorizontal: 16 },
  small: { paddingHorizontal: 16, paddingVertical: 10 },
  icon: { width: 48, height: 48 },
  danger: { borderColor: colors.danger },
  dashed: { borderStyle: "dashed" },
  disabled: { opacity: 0.4 },
});
