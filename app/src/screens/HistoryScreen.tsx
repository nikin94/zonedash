import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useFocusEffect } from "@react-navigation/native";
import { useShallow } from "zustand/react/shallow";

import { AppText } from "../components/AppText";
import { ConfirmModal } from "../components/ConfirmModal";
import { CustomPressable } from "../components/CustomPressable";
import { MODES } from "../components/DrillPanel/drillMode";
import { HistoryPanel } from "../components/HistoryPanel";
import { MoreIcon } from "../components/Icons";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { clearHistory } from "../state/history";
import { useAppStore } from "../state/AppState";
import { colors, glowShadow } from "../theme";

/**
 * The History tab — the device-local session log (moved off the Account tab, so
 * Account is now sign-in only and the former Settings tab's slot hosts this).
 *
 * The list re-reads on tab focus AND whenever a sign-in sync merges the cloud
 * archive in (historyVersion) — so a session finished on the Drill tab, or
 * synced from another device while this tab is already open, shows up without a
 * tab round-trip. Clearing the log lives in an overflow (⋮) menu beside the
 * title now (not a button under the list); it re-reads via a local key bump.
 *
 * A mode tab bar (Random · Path · Live) sits under the title, its tabs derived
 * straight from the drill MODES list — add a mode there and a history tab for it
 * appears automatically. Each tab filters the list to its own mode; an empty tab
 * shows the panel's "no sessions" hint. The Clear affordance still wipes the
 * WHOLE identity bucket (every mode), so it gates on the total count, not the
 * active tab's.
 */
export const HistoryScreen = () => {
  // Which identity's history to show: the signed-in account, or the anonymous
  // device log. A sign-in/out re-keys the list to the matching bucket.
  const { historyVersion, userId } = useAppStore(
    useShallow((s) => ({
      historyVersion: s.historyVersion,
      userId: s.authUser?.id ?? null,
    })),
  );

  // Bump on focus so HistoryPanel re-reads the log each time the tab is shown.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );
  // A clear bumps this to force a re-read (→ empty list). Combined with focus +
  // historyVersion (bumped when a sign-in sync writes the merged history); all
  // monotonic, so the sum changes on any of them.
  const [clearKey, setClearKey] = useState(0);
  const refreshKey = focusKey + historyVersion + clearKey;

  // The active mode tab — its rows are filtered to this mode. Defaults to the
  // first drill mode, so the tab bar opens on a real tab whatever MODES holds.
  const [activeMode, setActiveMode] = useState<string>(MODES[0].key);

  const [hasSessions, setHasSessions] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);

  const confirmClear = async () => {
    setClearAsk(false);
    await clearHistory(userId); // clear only the current identity's bucket
    setClearKey((k) => k + 1); // re-read → empty
  };

  return (
    <ScreenWrapper
      title="History"
      headerRight={
        hasSessions ? (
          <HistoryMenu onClear={() => setClearAsk(true)} />
        ) : undefined
      }
    >
      {/* Mode tabs, auto-derived from MODES — a new drill mode adds a tab here
          with no extra wiring. Fixed above the scroll so switching modes never
          scrolls the list; inset to the shared horizontal gutter so the filled
          track lines up with the title and the list below. */}
      <View style={styles.tabsWrap}>
        <SegmentedTabs
          testID="history-mode-tabs"
          tabs={MODES}
          activeKey={activeMode}
          onChange={setActiveMode}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        // The list stretches to fill the screen (`flexGrow`) with no reserved
        // bottom padding, so it runs flush to the bottom edge under the floating
        // (translucent) tab bar — no dead space beneath the last row. A log long
        // enough to scroll simply scrolls; a short one fills the height.
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HistoryPanel
          refreshKey={refreshKey}
          userId={userId}
          mode={activeMode}
          onLoaded={(n) => setHasSessions(n > 0)}
        />
      </ScrollView>

      <ConfirmModal
        visible={clearAsk}
        onDismiss={() => setClearAsk(false)}
        testID="clear-history-confirm"
        title="Clear session history?"
        body="This permanently removes every saved session on this device."
        actions={[
          { label: "Keep", onPress: () => setClearAsk(false) },
          { label: "Clear", danger: true, onPress: confirmClear },
        ]}
      />
    </ScreenWrapper>
  );
};

/**
 * The overflow (⋮) menu beside the History title: a kebab button that drops down
 * a small menu with the Clear action, dismissed by an outside tap. It only fires
 * `onClear` (which arms the screen's confirm) — the clear itself stays with the
 * screen that owns the list refresh.
 */
const HistoryMenu = ({ onClear }: { onClear: () => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <CustomPressable
        noFeedback
        hitSlop={10}
        testID="history-menu-button"
        accessibilityLabel="History options"
        onPress={() => setOpen((v) => !v)}
        style={styles.menuButton}
      >
        <MoreIcon color={colors.textSecondary} />
      </CustomPressable>

      {open && (
        <>
          {/* Oversized invisible catcher: any tap outside dismisses. */}
          <CustomPressable
            noFeedback
            testID="history-menu-backdrop"
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
            style={styles.menuBackdrop}
          />
          <View testID="history-menu" style={styles.menu}>
            <CustomPressable
              testID="clear-history-button"
              onPress={() => {
                setOpen(false);
                onClear();
              }}
              style={styles.menuItem}
            >
              <AppText weight="600" color={colors.danger}>
                Clear history
              </AppText>
            </CustomPressable>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // The filled tab track sits in the shared 24px gutter with a little room
  // below it before the list starts.
  tabsWrap: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  menuButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: {
    position: "absolute",
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
  },
  menu: {
    position: "absolute",
    top: 28,
    right: 0,
    minWidth: 160,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 6,
    overflow: "hidden",
    ...glowShadow,
  },
  menuItem: {
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
