import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_DISC_RISE } from "../navigation/GlassTabBar";
import { colors } from "../theme";
import { AppText } from "./AppText";

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
 *
 * An optional `title` renders a big, bold screen heading pinned above the
 * (scrolling) content — so every titled tab (Account, History) shares the exact
 * same top offset and title style. `headerRight` rides the title row, pinned to
 * the right edge (e.g. the History overflow menu).
 *
 * A shared bottom pad (TAB_BAR_DISC_RISE) keeps content clear of the tab bar's
 * raised centre disc, which pokes UP above the bar row — the only chrome that
 * overlaps a scene stretched flush to the bottom. Applied here once so every tab
 * inherits it without repeating the constant.
 */
export const ScreenWrapper = ({
  children,
  title,
  headerRight,
  style,
  testID,
}: {
  children: ReactNode;
  /** Big, bold screen heading pinned above the content. */
  title?: string;
  /** A node pinned to the right of the title row (e.g. an overflow menu). */
  headerRight?: ReactNode;
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
      {title != null && (
        <View style={styles.header}>
          <AppText size={28} weight="700" testID="screen-title">
            {title}
          </AppText>
          {headerRight}
        </View>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    // Clear the tab bar's raised centre disc so content stretched to the bottom
    // (e.g. the History list) never crosses under it.
    paddingBottom: TAB_BAR_DISC_RISE,
    backgroundColor: colors.background,
  },
  // Title row: heading left, optional accessory pinned right. A high zIndex so a
  // dropdown opened from the accessory (History's overflow menu) paints over the
  // scrolling content below it.
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
    zIndex: 20,
  },
});
