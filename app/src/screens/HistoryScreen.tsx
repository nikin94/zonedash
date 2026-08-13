import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFocusEffect } from "@react-navigation/native";

import { AppText } from "../components/AppText";
import { ConfirmModal } from "../components/ConfirmModal";
import { CustomPressable } from "../components/CustomPressable";
import { HistoryPanel } from "../components/HistoryPanel";
import { MoreIcon } from "../components/Icons";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { tabBarClearance } from "../navigation/GlassTabBar";
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
 */
export const HistoryScreen = () => {
  const historyVersion = useAppStore((s) => s.historyVersion);
  const insets = useSafeAreaInsets();

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

  const [hasSessions, setHasSessions] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);

  const confirmClear = async () => {
    setClearAsk(false);
    await clearHistory();
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
      <ScrollView
        style={styles.scroll}
        // Fill-or-scroll: `flexGrow` lets a short log grow to fill the screen and
        // `flex-end` drops it to the bottom, so the newest→oldest list ends right
        // above the tab bar with no dead space beneath it. A log long enough to
        // scroll already exceeds the height, so flexGrow is a no-op there and it
        // scrolls normally, clearing the floating bar via the bottom pad.
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-end",
          paddingBottom: tabBarClearance(insets.bottom),
        }}
        showsVerticalScrollIndicator={false}
      >
        <HistoryPanel
          refreshKey={refreshKey}
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
  scroll: {
    flex: 1,
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
