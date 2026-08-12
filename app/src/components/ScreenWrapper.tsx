import { type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors } from "../theme";

/** The uniform vertical offset every tab screen sits at below the header —
 *  minimal and identical across tabs, defined ONCE here. Kept small so the
 *  content hugs the header instead of floating far below it. */
export const SCREEN_PAD_TOP = 8;

/**
 * The common shell every tab screen composes its content inside: a flex-filling
 * column with the shared top offset and the page background. The top gap below
 * the header lives here, not per screen, so it can never drift between tabs —
 * and, for the Drill tab, its three swappable surfaces (idle / pairing / drill)
 * all share this single offset, so none of them can jump the court. It is the
 * natural home for any future screen-wide prop (padding, safe-area, etc.).
 */
export const ScreenWrapper = ({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  /** Extra style merged over the shared shell (e.g. a per-screen override). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) => (
  <View testID={testID} style={[styles.wrap, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: SCREEN_PAD_TOP,
    backgroundColor: colors.background,
  },
});
