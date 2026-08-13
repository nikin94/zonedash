import { StyleSheet, View } from "react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

/** One selectable segment — a stable key and its visible label. */
export interface SegmentTab {
  key: string;
  label: string;
}

/**
 * A top segment tab bar: an equal-width row of text tabs with an accent
 * underline under the active one. Driven entirely by the `tabs` list, so a
 * caller that maps it from a source list (e.g. the drill MODES) grows a tab
 * automatically when that list does — no per-tab wiring here.
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
  <View style={styles.row} testID={testID}>
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
          style={styles.tab}
        >
          <AppText
            size={14}
            weight={active ? "700" : "600"}
            color={active ? colors.text : colors.textMuted}
          >
            {t.label}
          </AppText>
          {/* The underline sits in the layout even when inactive (transparent),
              so switching tabs never shifts the row's height. */}
          <View style={[styles.underline, active && styles.underlineActive]} />
        </CustomPressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignSelf: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Equal-width tabs so the bar spans the full width whatever the tab count.
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  underline: {
    alignSelf: "stretch",
    height: 2,
    marginBottom: -1, // overlap the row's hairline so the accent replaces it
    backgroundColor: "transparent",
  },
  underlineActive: {
    backgroundColor: colors.accent,
  },
});
