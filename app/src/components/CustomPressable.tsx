import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors } from "../theme";

export interface CustomPressableProps extends Omit<PressableProps, "style"> {
  /** Skip the pressed surface flash — for invisible catchers (backdrops),
   *  selection chips/pills and court spots, which carry their own states. */
  noFeedback?: boolean;
  /** Plain style — the pressed feedback is appended here, after it. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's Pressable: the props every call site was repeating come as
 * defaults — accessibilityRole="button" (override via props if ever needed)
 * and the themed pressed-surface feedback — so usages only declare what
 * differs. `style` is a plain style instead of the ({pressed}) function.
 */
export const CustomPressable = ({
  noFeedback,
  style,
  ...rest
}: CustomPressableProps) => (
  <Pressable
    accessibilityRole="button"
    {...rest}
    style={({ pressed }) => [style, !noFeedback && pressed && styles.pressed]}
  />
);

const styles = StyleSheet.create({
  pressed: {
    backgroundColor: colors.surface,
  },
});
