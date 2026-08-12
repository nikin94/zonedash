import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type DrillSettings } from "../../state/AppState";
import { alpha, colors } from "../../theme";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { CustomPressable } from "../CustomPressable";
import { InfoIcon } from "../Icons";
import { SettingsPanel } from "../SettingsPanel";
import { WheelField } from "../WheelField";
import {
  COUNT_OPTIONS,
  DURATION_OPTIONS,
  MODES,
  type StopBy,
  type UiMode,
} from "./drillMode";

const STOP_OPTIONS: { key: StopBy; label: string }[] = [
  { key: "count", label: "Hits" },
  { key: "time", label: "Time" },
];

// The page slides in from the right (a lateral push, like a pushed nav screen)
// rather than up from the bottom — the Modal itself renders with no animation
// and we drive the horizontal translate.
const SCREEN_W = Dimensions.get("window").width;
const OPEN_MS = 260;
const CLOSE_MS = 220;

/**
 * The drill setup as its own full-screen page, opened from the gear beside
 * Start. It holds the mode selector, the Random-mode parameters (stop-by + the
 * hits/duration wheel) and the session-wide settings — the config that used to
 * sit inline under the court. Path/Live authoring stays on the court itself, so
 * only the mode and its numeric params live here.
 *
 * It slides in HORIZONTALLY (from the right, like a pushed screen) instead of
 * the Modal's default bottom-up slide, and is confirmed with a Done button
 * pinned at the bottom rather than a corner close icon. The exit animation needs
 * the Modal to stay mounted past `visible` going false, so `mounted` trails it
 * and only drops once the slide-out completes.
 *
 * Presentation only: it reads and writes the caller's drill-config state, so the
 * court surface (which runs the drill) and this page never drift.
 */
export const DrillSettingsModal = ({
  visible,
  onClose,
  onModeInfo,
  uiMode,
  setUiMode,
  stopBy,
  setStopBy,
  count,
  setCount,
  durationMs,
  setDurationMs,
  settings,
  onSettingsChange,
}: {
  visible: boolean;
  onClose: () => void;
  /** Open the per-mode explainer (kept on the caller so it can layer over this). */
  onModeInfo: () => void;
  uiMode: UiMode;
  setUiMode: (m: UiMode) => void;
  stopBy: StopBy;
  setStopBy: (s: StopBy) => void;
  count: number;
  setCount: (n: number) => void;
  durationMs: number;
  setDurationMs: (ms: number) => void;
  /** The session-wide drill settings (delay + immediate repeat), edited here now
   *  that the Settings tab is gone — the History list took its place. */
  settings: DrillSettings;
  onSettingsChange: (next: DrillSettings) => void;
}) => {
  const insets = useSafeAreaInsets();
  // Keep the Modal mounted through the slide-out; `mounted` trails `visible`.
  const [mounted, setMounted] = useState(visible);
  // Off-screen right when closed, 0 when open. Native-driven (transform only).
  const translateX = useRef(new Animated.Value(visible ? 0 : SCREEN_W)).current;
  const wasVisible = useRef(visible);

  useEffect(() => {
    if (visible === wasVisible.current) return; // no change (initial mount)
    wasVisible.current = visible;
    if (visible) {
      setMounted(true);
      translateX.setValue(SCREEN_W);
      Animated.timing(translateX, {
        toValue: 0,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: SCREEN_W,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, translateX]);

  return (
    <Modal
      visible={mounted}
      animationType="none"
      onRequestClose={onClose}
      testID="drill-settings-modal"
    >
      <Animated.View
        style={[
          styles.page,
          { paddingTop: insets.top + 8, transform: [{ translateX }] },
        ]}
      >
        <View style={styles.header}>
          <AppText size={18} weight="700">
            Drill setup
          </AppText>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.row}>
            <View style={styles.modeLabel}>
              <AppText color={colors.textSecondary} style={styles.paramLabel}>
                Mode
              </AppText>
              <CustomPressable
                noFeedback
                hitSlop={10}
                testID="mode-info-button"
                accessibilityLabel="About drill modes"
                onPress={onModeInfo}
                style={styles.infoButton}
              >
                <InfoIcon size={16} color={colors.textMuted} />
              </CustomPressable>
            </View>
            <View style={styles.chips}>
              {MODES.map((m) => (
                <Button
                  key={m.key}
                  label={m.label}
                  size="small"
                  textSize={14}
                  noFeedback
                  selected={uiMode === m.key}
                  textColor={colors.textSecondary}
                  onPress={() => setUiMode(m.key)}
                />
              ))}
            </View>
          </View>

          {uiMode === "random" && (
            <>
              <View style={styles.row}>
                <AppText color={colors.textSecondary} style={styles.paramLabel}>
                  Session length
                </AppText>
                <View style={styles.chips}>
                  {STOP_OPTIONS.map((s) => (
                    <Button
                      key={s.key}
                      label={s.label}
                      size="small"
                      textSize={14}
                      noFeedback
                      selected={stopBy === s.key}
                      textColor={colors.textSecondary}
                      onPress={() => setStopBy(s.key)}
                    />
                  ))}
                </View>
              </View>
              {stopBy === "count" ? (
                <WheelField
                  value={count}
                  label="Targets to hit"
                  testID="drill-count"
                  options={COUNT_OPTIONS}
                  onChange={setCount}
                />
              ) : (
                <WheelField
                  value={durationMs}
                  label="Duration"
                  testID="drill-duration"
                  options={DURATION_OPTIONS}
                  onChange={setDurationMs}
                />
              )}
            </>
          )}

          {uiMode !== "random" && (
            <AppText size={13} color={colors.textMuted} style={styles.hint}>
              {uiMode === "path"
                ? "Tap the paired spots on the court, in order, to build the sequence."
                : "Light targets by hand during the run — one tap each."}
            </AppText>
          )}

          {/* The session-wide drill settings (delay + immediate repeat) live
              here under a divider now — the Settings tab became History. The
              embedded style drops the panel's own screen padding so it flows in
              this page's column. */}
          <View style={styles.divider} />
          <SettingsPanel
            settings={settings}
            onChange={onSettingsChange}
            style={styles.settings}
          />
        </ScrollView>

        {/* Confirm the setup and return to the court — a pinned Done button
            instead of a corner close icon. It just dismisses (edits already
            wrote through to the caller as they were made). */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button
            label="Done"
            primary
            testID="drill-settings-done"
            onPress={onClose}
          />
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  paramLabel: {
    flexShrink: 1,
  },
  infoButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    flexDirection: "row",
    gap: 8,
  },
  hint: {
    lineHeight: 18,
  },
  // Separates the mode/params from the session-wide settings below.
  divider: {
    height: 1,
    marginTop: 4,
    backgroundColor: colors.border,
  },
  // The embedded SettingsPanel: drop its own screen padding (the page column
  // already insets), keep it flush with the rest of the setup.
  settings: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  // The pinned Done bar: a hairline top border sets it off from the scrolling
  // content so it always reads as the confirm affordance.
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: alpha(colors.border, 0.4),
    backgroundColor: colors.background,
  },
});
