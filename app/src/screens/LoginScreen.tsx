import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useShallow } from "zustand/react/shallow";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { useAppStore } from "../state/AppState";
import { colors } from "../theme";

/**
 * The first-run login gate. Accounts are OPTIONAL (signed-out is a first-class,
 * fully-functional local-only mode), so this screen never blocks the app — it
 * just offers the choice once:
 *  - "Sign in with Google" → cloud sync across devices (loading while in flight)
 *  - "Continue offline" → skip; the app runs local-only
 *
 * Either choice latches `authGatePassed` (durable), so the gate shows once —
 * until an explicit Sign out (on the Account tab) reopens it. Reads the store
 * directly (the AuthProvider seam), so it behaves identically on the mock and
 * the real Supabase provider.
 */
export const LoginScreen = () => {
  const { authStatus, authError, signIn, skipAuthGate } = useAppStore(
    useShallow((s) => ({
      authStatus: s.authStatus,
      authError: s.authError,
      signIn: s.signIn,
      skipAuthGate: s.skipAuthGate,
    })),
  );
  const insets = useSafeAreaInsets();
  const signingIn = authStatus === "signing-in";

  return (
    <View
      testID="login-screen"
      style={[
        styles.page,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Brand block, centred in the free space above the actions. */}
      <View style={styles.hero}>
        <AppText size={34} weight="700" style={styles.brand}>
          ZoneDash
        </AppText>
        <AppText
          center
          size={15}
          color={colors.textSecondary}
          style={styles.tagline}
        >
          Sign in to sync your session history across devices — or continue
          without an account and keep everything on this device.
        </AppText>
      </View>

      {/* Actions pinned to the bottom of the column. */}
      <View style={styles.actions}>
        <Button
          testID="login-google"
          label="Sign in with Google"
          primary
          textSize={17}
          loading={signingIn}
          onPress={signIn}
        />
        <Button
          testID="login-skip"
          label="Continue offline"
          textColor={colors.textSecondary}
          disabled={signingIn}
          onPress={skipAuthGate}
        />
        {/* A cancelled / failed sign-in surfaces here without leaving the gate. */}
        <View testID="login-error" style={styles.errorSlot}>
          {authError !== null && (
            <AppText center size={13} numberOfLines={2} color={colors.danger}>
              {authError}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  brand: {
    letterSpacing: 1.5,
  },
  tagline: {
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  actions: {
    alignSelf: "stretch",
    gap: 12,
  },
  // Fixed slot so an error appearing/clearing never nudges the buttons.
  errorSlot: {
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
