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
  /** Override the pressed-surface colour. Filled buttons (e.g. the accent hero)
   *  pass a tint of their own fill so the label stays legible, instead of the
   *  default near-white surface flash that would wash a white label out. */
  pressedColor?: string;
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
  pressedColor,
  style,
  ...rest
}: CustomPressableProps) => (
  <Pressable
    accessibilityRole="button"
    {...rest}
    style={({ pressed }) => [
      style,
      !noFeedback &&
        pressed &&
        (pressedColor != null
          ? { backgroundColor: pressedColor }
          : styles.pressed),
    ]}
  />
);

const styles = StyleSheet.create({
  pressed: {
    backgroundColor: colors.surface,
  },
});
