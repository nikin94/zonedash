import { Modal, StyleSheet, View } from "react-native";

import type { AuthStatus, AuthUser } from "../state/auth";
import { alpha, colors, glowShadow } from "../theme";
import { AccountSection } from "./AccountSection";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

/**
 * The account screen — the app's single sign-in surface, opened from the header
 * account button. The app has no navigation stack, so a "screen" is a centered
 * modal, same scrim + card treatment as SettingsModal / HistoryModal. A tap on
 * the scrim dismisses it.
 *
 * Accounts are OPTIONAL: signed-out is first-class (local-only history, exactly
 * today), so this never gates the app and is only ever reached on purpose — no
 * first-run nag. The controls are the shared AccountSection (the one place the
 * three auth states are encoded, reused not duplicated); this screen adds the
 * card chrome and surfaces a failed sign-in, which AppState otherwise emits and
 * drops.
 */
export const AccountModal = ({
  visible,
  onDismiss,
  status,
  user,
  error,
  onSignIn,
  onSignOut,
}: {
  visible: boolean;
  onDismiss: () => void;
  status: AuthStatus;
  user: AuthUser | null;
  /** Last sign-in failure reason, shown under the controls; null hides the line. */
  error: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onDismiss}
  >
    <View style={styles.scrim}>
      {/* A dark dim over the light page so the card pops. A tap outside the
          card closes it. */}
      <CustomPressable
        noFeedback
        testID="account-backdrop"
        accessibilityLabel="Dismiss account"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
        <AccountSection
          status={status}
          user={user}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
        {error !== null && (
          <AppText
            size={12}
            color={colors.danger}
            style={styles.error}
            testID="account-error"
          >
            Sign-in failed — {error}
          </AppText>
        )}
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: alpha(colors.scrim, 0.5),
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 12,
    ...glowShadow,
  },
  error: {
    paddingHorizontal: 24,
    paddingTop: 8,
    lineHeight: 16,
  },
});
