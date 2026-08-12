import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { ToastHost } from "./Toast";

/** Header vertical padding, above and below the row. The safe-area top inset is
 *  added ON TOP of the top pad, so the header's total height is
 *  `insets.top + HEADER_HEIGHT`. */
const HEADER_V_PAD = 8;
/** The title row's height — a fixed floor so the header can't collapse now that
 *  the status chip has moved to the court, keeping the toast anchor stable. */
const HEADER_ROW_H = 44;
/** Header height BELOW the safe-area top inset (top pad + row + bottom pad). The
 *  toast anchors to the header's bottom edge (`insets.top + HEADER_HEIGHT`) so it
 *  always clears the notch — a percent `top` against the auto-height header
 *  resolved to ~0 under the New Architecture and drew over the brow. */
export const HEADER_HEIGHT = HEADER_V_PAD + HEADER_ROW_H + HEADER_V_PAD;

/**
 * The persistent app header, above the tab navigator: just the app title (and
 * the app-wide toast anchored to its bottom edge). The central-unit status —
 * once a chip + dropdown here — moved ONTO the court (CourtStatusControl), so
 * this header is pure identity + notification chrome now.
 */
export const AppHeader = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + HEADER_V_PAD,
          minHeight: insets.top + HEADER_HEIGHT,
        },
      ]}
    >
      <AppText size={20} weight="700" style={styles.headerTitle}>
        ZoneDash
      </AppText>

      {/* App-wide toast, anchored to the header's bottom edge — the header hands
          it a safe-area-aware offset (below the notch) so it never draws over
          the brow. Its own store subscription (memoised) means a fired toast
          re-renders ONLY the toast, never this header. */}
      <ToastHost topOffset={insets.top + HEADER_HEIGHT} />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: HEADER_V_PAD,
    zIndex: 20, // the toast overlays the content below
  },
  headerTitle: {
    letterSpacing: 1,
  },
});
