import { Modal, StyleSheet, View } from "react-native";

import { alpha, colors, glowShadow } from "../../theme";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { CustomPressable } from "../CustomPressable";

/** One drill mode's name + one-line explanation, as shown in the modal. */
export interface ModeInfo {
  label: string;
  description: string;
}

/**
 * The drill-modes explainer — opened from the info icon next to the Mode
 * selector. It replaces the always-on description line under the selector: the
 * same per-mode copy, now on demand, so the drill setup stays compact. Centered
 * over a dimmed scrim like ConfirmModal; a tap outside the card (or "Got it")
 * dismisses.
 */
export const ModeInfoModal = ({
  visible,
  onDismiss,
  modes,
}: {
  visible: boolean;
  onDismiss: () => void;
  modes: ModeInfo[];
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onDismiss}
  >
    <View style={styles.scrim}>
      <CustomPressable
        noFeedback
        testID="mode-info-backdrop"
        accessibilityLabel="Dismiss drill modes"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card} testID="mode-info">
        <AppText size={12} color={colors.textSecondary} style={styles.heading}>
          Drill modes
        </AppText>
        {modes.map((m) => (
          <View key={m.label} style={styles.row}>
            <AppText size={15} weight="700">
              {m.label}
            </AppText>
            <AppText size={13} color={colors.textMuted} style={styles.desc}>
              {m.description}
            </AppText>
          </View>
        ))}
        <Button label="Got it" onPress={onDismiss} style={styles.done} />
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 14,
    ...glowShadow,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  row: {
    gap: 2,
  },
  desc: {
    lineHeight: 18,
  },
  done: {
    alignSelf: "stretch",
    marginTop: 4,
  },
});
