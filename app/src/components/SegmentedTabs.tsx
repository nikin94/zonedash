import { StyleSheet, View } from "react-native";

import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

/** One selectable segment — a stable key and its visible label. */
export interface SegmentTab {
  key: string;
  label: string;
}

/**
 * A filled segmented control: an equal-width row of text tabs riding on a solid
 * track, with the app's main (background) colour forming a raised thumb under
 * the active one. Driven entirely by the `tabs` list, so a caller that maps it
 * from a source list (e.g. the drill MODES) grows a tab automatically when that
 * list does — no per-tab wiring here.
 *
 * Presentation only: it owns no selection state. The parent holds `activeKey`
 * and updates it from `onChange`, so the same bar can drive a list filter, a
 * pager, or anything keyed by segment.
 */
export const SegmentedTabs = ({
  tabs,
  activeKey,
  onChange,
  testID,
}: {
  tabs: SegmentTab[];
  activeKey: string;
  onChange: (key: string) => void;
  testID?: string;
}) => (
  <View style={styles.track} testID={testID}>
    {tabs.map((t) => {
      const active = t.key === activeKey;
      return (
        <CustomPressable
          key={t.key}
          noFeedback
          testID={`segment-${t.key}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={t.label}
          onPress={() => onChange(t.key)}
          // The active tab lifts onto a main-colour thumb; the rest stay flush
          // on the filled track, so the selection reads as the background
          // sliding onto the chosen segment.
          style={[styles.tab, active && styles.tabActive]}
        >
          <AppText
            size={14}
            weight={active ? "700" : "600"}
            color={active ? colors.text : colors.textMuted}
          >
            {t.label}
          </AppText>
        </CustomPressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  // The whole bar is a solid, rounded track; the active thumb sits inside it
  // with a small inset (the track padding), so the fill frames the selection.
  track: {
    flexDirection: "row",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  // Equal-width tabs so the bar spans the full width whatever the tab count.
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  // The active thumb: the app's main colour lifted off the track with a soft
  // shadow, so the selected segment reads as raised.
  tabActive: {
    backgroundColor: colors.background,
    ...glowShadow,
  },
});
