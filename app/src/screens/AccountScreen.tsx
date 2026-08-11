import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useFocusEffect } from "@react-navigation/native";

import { AccountSection } from "../components/AccountSection";
import { AppText } from "../components/AppText";
import { HistoryPanel } from "../components/HistoryPanel";
import { useAppState } from "../state/AppState";
import { colors } from "../theme";

/**
 * The Account tab — the app's one sign-in surface plus session history:
 *  - AccountSection: signed-out → "Sign in with Google"; signed-in → account +
 *    "Sign out" (the way back to the logged-out / login state).
 *  - a sign-in error line when the last attempt was cancelled/failed.
 *  - HistoryPanel: the device-local session log, re-pulled on tab focus so a
 *    session finished on the Drill tab shows up here.
 */
export const AccountScreen = () => {
  const { authStatus, authUser, authError, signIn, signOut } = useAppState();

  // Bump on focus so HistoryPanel re-reads the log each time the tab is shown.
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  return (
    <ScrollView
      style={styles.screen}
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
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 8,
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
