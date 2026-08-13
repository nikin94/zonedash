import { ScrollView, StyleSheet, View } from "react-native";
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

/**
 * The drill setup as its own screen, PUSHED onto a nested native-stack from the
 * gear beside Start. It holds the mode selector, the Random-mode parameters
 * (stop-by + the hits/duration wheel) and the session-wide settings — the config
 * that used to sit inline under the court. Path/Live authoring stays on the court
 * itself, so only the mode and its numeric params live here.
 *
 * Plain content (no Modal, no hand-rolled slide): the navigator drives the
 * horizontal push — the new screen slides in OVER the drill surface, which stays
 * visible behind it, and slides back on Done. The footer tab bar hides while this
 * page is up (GlassTabBar), so a Done button pinned at the very bottom is the only
 * chrome there — no corner close icon.
 *
 * Presentation only: it reads and writes the caller's drill-config state, so the
 * court surface (which runs the drill) and this page never drift.
 */
export const DrillSetupPage = ({
  onDone,
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
  /** Dismiss the page — the navigator pops back to the drill surface. */
  onDone: () => void;
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
    <View style={styles.page} testID="drill-settings-page">
      {/* Presented as a window-level modal, this page no longer sits under the
          ScreenWrapper's shared top offset — so it clears the notch itself. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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

        {/* Path/Live need no inline how-to here — the per-mode explainer behind
            the info icon already covers it, so the setup stays uncluttered. */}

        {/* The session-wide drill settings (delay + immediate repeat) live here
            under a divider now — the Settings tab became History. The embedded
            style drops the panel's own screen padding so it flows in this
            page's column. */}
        <View style={styles.divider} />
        <SettingsPanel
          settings={settings}
          onChange={onSettingsChange}
          style={styles.settings}
        />
      </ScrollView>

      {/* Confirm the setup and return to the court — a pinned Done button
          instead of a corner close icon. It just pops the screen (edits already
          wrote through to the caller as they were made). The tab bar hides on
          this page (GlassTabBar), so Done sits at the very bottom, clearing only
          the home-indicator safe area. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label="Done"
          primary
          testID="drill-settings-done"
          onPress={onDone}
        />
      </View>
    </View>
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
