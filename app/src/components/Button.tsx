import { type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, glowShadow } from "../theme";
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
  /** In-flight: swaps the label for a spinner and blocks the press (without the
   *  greyed-out look), so an async action (e.g. Connect) shows progress. */
  loading?: boolean;
  /** Destructive: red outline and red label. */
  danger?: boolean;
  /** Dashed outline — a quiet/secondary affordance (e.g. the dev shortcut). */
  dashed?: boolean;
  /** Selected/toggle state — accent fill + border + label (Mode / length chips). */
  selected?: boolean;
  /** Primary/hero action — a solid accent fill with a white label and a soft
   *  lift, so the page's main call-to-action (Start) reads above the outline
   *  chips around it. */
  primary?: boolean;
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
  loading = false,
  danger = false,
  dashed = false,
  selected = false,
  primary = false,
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
    // A filled accent hero presses to a LIGHTER accent, not the near-white
    // surface flash — otherwise the pressed fill collides with the white label.
    pressedColor={primary ? colors.accentPressed : undefined}
    testID={testID}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled, selected, busy: loading }}
    // A press mid-flight is a no-op, but loading keeps full opacity (progress,
    // not a disabled look) — only `disabled` greys the button out.
    disabled={disabled || loading}
    onPress={onPress}
    style={[
      styles.base,
      styles[size],
      danger && styles.danger,
      dashed && styles.dashed,
      selected && styles.selected,
      primary && styles.primary,
      disabled && styles.disabled,
      style,
    ]}
  >
    {loading ? (
      <ActivityIndicator
        testID={testID != null ? `${testID}-spinner` : undefined}
        color={
          primary
            ? colors.background
            : (textColor ?? (danger ? colors.danger : colors.text))
        }
      />
    ) : label != null ? (
      <AppText
        center
        numberOfLines={1}
        size={textSize}
        weight="600"
        color={
          selected
            ? colors.accentText
            : primary
              ? colors.background
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
  selected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  // Hero fill: solid accent with a matching border and a soft shadow so the
  // primary action lifts off the white page. A taller footprint than a regular
  // button gives it more presence. The white label is set on the AppText above.
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    paddingVertical: 13,
    ...glowShadow,
  },
  disabled: { opacity: 0.4 },
});
