import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../theme";

/** The uniform gap every tab screen leaves above its content, on top of the
 *  safe-area top inset. Minimal and identical across tabs, defined ONCE here.
 *  Kept small so the content hugs the top instead of floating far below it. */
export const SCREEN_PAD_TOP = 8;

/**
 * The common shell every tab screen composes its content inside: a flex-filling
 * column that clears the safe-area top (there is no header anymore) plus a small
 * uniform gap, over the page background. The top offset lives here, not per
 * screen, so it can never drift between tabs — and, for the Drill tab, its three
 * swappable surfaces (idle / pairing / drill) all share this single offset, so
 * none of them can jump the court.
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
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[styles.wrap, { paddingTop: insets.top + SCREEN_PAD_TOP }, style]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
