import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

/** One selectable segment — a stable key and its visible label. */
export interface SegmentTab {
  key: string;
  label: string;
}

// The track's inner padding — the thumb insets by this on every side so the
// filled track frames the selection.
const PAD = 3;

/**
 * A filled segmented control: an equal-width row of text tabs riding on a solid
 * track, with the app's main (background) colour forming a raised thumb that
 * SLIDES to the active segment (RN `Animated`, native-driven — no extra deps,
 * matching the app's other animations). Driven entirely by the `tabs` list, so a
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
}) => {
  const n = tabs.length;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey),
  );

  // The track's measured inner width (padding excluded) drives the pixel-exact
  // thumb width/position. Zero until the first layout — before then the thumb
  // falls back to an even percentage width sitting at index 0 (the default), so
  // it's visible immediately with no flash for the common index-0 start.
  const [innerW, setInnerW] = useState(0);
  const segW = n > 0 ? innerW / n : 0;

  // The thumb's X offset, animated so a tab change slides it across rather than
  // snapping. Native-driven (transform only), so it never touches the JS thread.
  const thumbX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(thumbX, {
      toValue: activeIndex * segW,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [activeIndex, segW, thumbX]);

  const thumbTestID = testID != null ? `${testID}-thumb` : "segmented-thumb";

  return (
    <View
      style={styles.track}
      testID={testID}
      onLayout={(e) =>
        setInnerW(Math.max(0, e.nativeEvent.layout.width - PAD * 2))
      }
    >
      {/* The sliding thumb — the main-colour fill under the active segment.
          Rendered first (behind the transparent segments) and non-interactive,
          so taps fall through to the segments above it. */}
      <Animated.View
        testID={thumbTestID}
        pointerEvents="none"
        style={[
          styles.thumb,
          innerW > 0
            ? { width: segW, transform: [{ translateX: thumbX }] }
            : { width: `${100 / n}%` },
        ]}
      />
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
          </CustomPressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  // The whole bar is a solid, rounded track; the thumb sits inside it inset by
  // PAD on every side, so the fill frames the selection.
  track: {
    flexDirection: "row",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: PAD,
  },
  // Equal-width tabs so the bar spans the full width whatever the tab count.
  // Transparent — the sliding thumb below is what marks the selection.
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  // The sliding thumb: the app's main colour lifted off the track with a soft
  // shadow, so the selected segment reads as raised. Absolutely placed inside
  // the track's padding box; translateX moves it to the active segment.
  thumb: {
    position: "absolute",
    left: PAD,
    top: PAD,
    bottom: PAD,
    backgroundColor: colors.background,
    borderRadius: 9,
    ...glowShadow,
  },
});
