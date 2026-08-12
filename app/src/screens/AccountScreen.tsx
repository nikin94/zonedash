import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useFocusEffect } from "@react-navigation/native";

import { AccountSection } from "../components/AccountSection";
import { AppText } from "../components/AppText";
import { HistoryPanel } from "../components/HistoryPanel";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { useAppState } from "../state/AppState";
import { colors } from "../theme";

/**
 * The Account tab — the app's one sign-in surface plus session history:
 *  - AccountSection: signed-out → "Sign in with Google"; signed-in → account +
 *    "Sign out" (the way back to the logged-out / login state).
 *  - a sign-in error line when the last attempt was cancelled/failed.
 *  - HistoryPanel: the device-local session log, re-pulled on tab focus AND
 *    whenever a sign-in sync merges the cloud archive in (historyVersion) — so
 *    a session finished on the Drill tab, or synced from another device while
 *    this tab is already open, shows up without a tab round-trip.
 */
export const AccountScreen = () => {
  const { authStatus, authUser, authError, signIn, signOut, historyVersion } =
    useAppState();

  // Bump on focus so HistoryPanel re-reads the log each time the tab is shown.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );
  // Combine focus with historyVersion (bumped when a sign-in sync writes the
  // merged history). Both are monotonic, so the sum changes on either — a
  // sync that lands while the tab is already focused still re-reads the list.
  const refreshKey = focusKey + historyVersion;

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AccountSection
          status={authStatus}
          user={authUser}
          onSignIn={signIn}
          onSignOut={signOut}
        />
        {authError !== null && (
          <AppText
            size={12}
            color={colors.danger}
            style={styles.error}
            testID="auth-error"
          >
            {authError}
          </AppText>
        )}

        <View style={styles.divider} />

        <HistoryPanel refreshKey={refreshKey} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 120, // clear the floating glass tab bar
    gap: 16,
  },
  error: {
    paddingHorizontal: 24,
  },
  divider: {
    height: 1,
    marginHorizontal: 24,
    backgroundColor: colors.border,
  },
});
