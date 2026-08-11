import { Modal, StyleSheet, View } from "react-native";

import { type DrillSettings } from "../state/AppState";
import { alpha, colors, glowShadow } from "../theme";
import { CustomPressable } from "./CustomPressable";
import { SettingsPanel } from "./SettingsPanel";

/**
 * Drill settings shown as a centered modal — the single screen has no
 * navigation, so the header's settings gear opens the panel over the current
 * surface (same scrim + card treatment as ConfirmModal). A tap on the scrim
 * outside the card dismisses it. Account/sign-in lives on its own screen
 * (AccountModal), opened from the header's account button — not here.
 */
export const SettingsModal = ({
  visible,
  onDismiss,
  settings,
  onChange,
}: {
  visible: boolean;
  onDismiss: () => void;
  settings: DrillSettings;
  onChange: (next: DrillSettings) => void;
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
        testID="settings-backdrop"
        accessibilityLabel="Dismiss settings"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
        <SettingsPanel settings={settings} onChange={onChange} />
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
});
