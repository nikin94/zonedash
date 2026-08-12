import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type DrillSettings } from "../../state/AppState";
import { colors } from "../../theme";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { CustomPressable } from "../CustomPressable";
import { CloseIcon, InfoIcon } from "../Icons";
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

/**
 * The drill setup as its own full-screen page (a slide-up modal), opened from
 * the gear beside Start. It holds the mode selector and the Random-mode
 * parameters (stop-by + the hits/duration wheel) — the config that used to sit
 * inline under the court. Path/Live authoring stays on the court itself (tapping
 * out a sequence), so only the mode and its numeric params live here.
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      testID="drill-settings-modal"
    >
      <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <AppText size={18} weight="700">
            Drill setup
          </AppText>
          <CustomPressable
            hitSlop={10}
            testID="drill-settings-close"
            accessibilityLabel="Close drill setup"
            onPress={onClose}
            style={styles.close}
          >
            <CloseIcon />
          </CustomPressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
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
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
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
});
