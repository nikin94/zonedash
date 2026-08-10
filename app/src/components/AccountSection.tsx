import { StyleSheet, View } from "react-native";

import type { AuthStatus, AuthUser } from "../state/auth";
import { colors } from "../theme";
import { AppText } from "./AppText";
import { Button } from "./Button";

/**
 * Account row in the settings modal — the app's one sign-in surface (no nav).
 * Accounts are OPTIONAL: signed-out is a first-class state (local-only history,
 * exactly today), so this section just offers cloud sync, never gates the app.
 *  - signed-out  → "Sign in with Google" (syncs history across devices once in)
 *  - signing-in  → disabled, "Signing in…"
 *  - signed-in   → the account (name/email) + "Sign out"
 *
 * Pure presentation: status + handlers come from AppState (the AuthProvider
 * seam), so it renders identically on the mock and the real Supabase provider.
 */
export const AccountSection = ({
  status,
  user,
  onSignIn,
  onSignOut,
}: {
  status: AuthStatus;
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) => (
  <View style={styles.section} testID="account-section">
    <AppText size={12} color={colors.textSecondary} style={styles.heading}>
      Account
    </AppText>

    {status === "signed-in" && user !== null ? (
      <View style={styles.row}>
        <View style={styles.who}>
          <AppText size={14} weight="600" testID="account-name">
            {user.name ?? user.email ?? "Signed in"}
          </AppText>
          {user.name !== null && user.email !== null && (
            <AppText size={12} color={colors.textMuted}>
              {user.email}
            </AppText>
          )}
        </View>
        <Button
          label="Sign out"
          size="small"
          textSize={15}
          testID="sign-out"
          onPress={onSignOut}
        />
      </View>
    ) : (
      <>
        <Button
          label={status === "signing-in" ? "Signing in…" : "Sign in with Google"}
          disabled={status === "signing-in"}
          testID="sign-in-google"
          onPress={onSignIn}
        />
        <AppText size={12} color={colors.textMuted} style={styles.hint}>
          Optional — sign in to sync your history across devices. Without it,
          history stays on this device.
        </AppText>
      </>
    )}
  </View>
);

const styles = StyleSheet.create({
  section: {
    alignSelf: "stretch",
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  who: {
    flexShrink: 1,
    gap: 2,
  },
  hint: {
    lineHeight: 16,
  },
});
