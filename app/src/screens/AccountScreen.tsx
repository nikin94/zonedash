import { ScrollView, StyleSheet } from "react-native";

import { useShallow } from "zustand/react/shallow";

import { AccountSection } from "../components/AccountSection";
import { AppText } from "../components/AppText";
import { ScreenWrapper } from "../components/ScreenWrapper";
import { useAppStore } from "../state/AppState";
import { colors } from "../theme";

/**
 * The Account tab — the app's one sign-in surface. Signed-out → "Sign in with
 * Google"; signed-in → account + "Sign out" (the way back to the logged-out
 * state), plus a sign-in error line when the last attempt was cancelled/failed.
 *
 * Session history moved to its own History tab (the former Settings tab's slot),
 * so this screen is sign-in only now.
 */
export const AccountScreen = () => {
  const { authStatus, authUser, authError, signIn, signOut } = useAppStore(
    useShallow((s) => ({
      authStatus: s.authStatus,
      authUser: s.authUser,
      authError: s.authError,
      signIn: s.signIn,
      signOut: s.signOut,
    })),
  );

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
});
