import { Modal, StyleSheet, View } from "react-native";

import { alpha, colors, glowShadow } from "../theme";
import { ConfirmDialog } from "./ConfirmDialog";
import { CustomPressable } from "./CustomPressable";

/**
 * The app's confirm — the one and only way confirms are shown: centered over a
 * dimmed full-screen scrim. Built on RN Modal so it overlays the whole screen
 * from wherever it is invoked (header menu, court centre), not just under its
 * caller. A tap on the scrim outside the card dismisses it (same as No/cancel).
 */
export const ConfirmModal = ({
  visible,
  onDismiss,
  testID,
  title,
  body,
  actions,
}: {
  visible: boolean;
  onDismiss: () => void;
  testID?: string;
  title: string;
  body?: string;
  actions: { label: string; onPress: () => void; danger?: boolean }[];
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onDismiss}
  >
    <View style={styles.scrim}>
      {/* Tap anywhere outside the card dismisses. */}
      <CustomPressable
        noFeedback
        testID={testID != null ? `${testID}-backdrop` : undefined}
        accessibilityLabel="Dismiss dialog"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
        <ConfirmDialog testID={testID} title={title} body={body} actions={actions} />
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
    // A dark dim over the light page so the card pops and the background reads
    // as inactive (a same-color scrim would just wash the screen out).
    backgroundColor: alpha(colors.scrim, 0.5),
  },
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    ...glowShadow,
  },
});
