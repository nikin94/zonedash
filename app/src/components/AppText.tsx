import { StyleSheet, Text, type TextProps } from "react-native";

import { colors } from "../theme";

/**
 * The app's Text: themed default color so plain usages read correctly on the
 * dark background. Use this instead of react-native's Text everywhere; passed
 * styles come after the base and override it as usual.
 */
export const AppText = ({ style, ...rest }: TextProps) => (
  <Text {...rest} style={[styles.base, style]} />
);

const styles = StyleSheet.create({
  base: {
    color: colors.text,
  },
});
