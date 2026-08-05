import {
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
} from "react-native";

import { colors } from "../theme";

export interface AppTextProps extends TextProps {
  center?: boolean; // textAlign: "center"
  size?: number; // fontSize; defaults to the app's body size
  weight?: TextStyle["fontWeight"];
  color?: string;
}

/** The app's default (and most common) text size. */
export const DEFAULT_TEXT_SIZE = 14;

/**
 * The app's Text: size/weight/color/center come as props instead of styles, so
 * typography is declared where the text is rendered. Use this instead of
 * react-native's Text everywhere; a passed style comes after the props and
 * overrides them as usual.
 */
export const AppText = ({
  center,
  size = DEFAULT_TEXT_SIZE,
  weight,
  color = colors.text,
  style,
  ...rest
}: AppTextProps) => (
  <Text
    {...rest}
    style={[{ fontSize: size, fontWeight: weight, color }, center && styles.center, style]}
  />
);

const styles = StyleSheet.create({
  center: {
    textAlign: "center",
  },
});
