import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { useFocusEffect } from "@react-navigation/native";

import { HistoryPanel } from "../components/HistoryPanel";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { useAppStore } from "../state/AppState";

/**
 * The History tab — the device-local session log (moved off the Account tab, so
 * Account is now sign-in only and the former Settings tab's slot hosts this).
 *
 * The list re-reads on tab focus AND whenever a sign-in sync merges the cloud
 * archive in (historyVersion) — so a session finished on the Drill tab, or
 * synced from another device while this tab is already open, shows up without a
 * tab round-trip.
 */
export const HistoryScreen = () => {
  const historyVersion = useAppStore((s) => s.historyVersion);

  // Bump on focus so HistoryPanel re-reads the log each time the tab is shown.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );
  // Combine focus with historyVersion (bumped when a sign-in sync writes the
  // merged history). Both are monotonic, so the sum changes on either — a sync
  // that lands while the tab is already focused still re-reads the list.
  const refreshKey = focusKey + historyVersion;

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HistoryPanel refreshKey={refreshKey} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 120, // clear the floating glass tab bar
  },
});
