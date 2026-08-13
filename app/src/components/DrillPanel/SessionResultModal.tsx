import { Modal, StyleSheet, View } from "react-native";

import { formatSeconds } from "../../helpers/time";
import { alpha, colors, glowShadow } from "../../theme";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { CustomPressable } from "../CustomPressable";

/**
 * The session-complete popup — shown once a run finishes with at least one hit.
 * It is the completion announcement (replacing the old transient toast), and
 * gathers the headline numbers a coach reads at a glance: who ran it (when a
 * name is set), the hit count, the total time and the average reaction. The
 * per-attempt detail still lives in the results panel under the court; this is
 * the summary that pops.
 *
 * Centred over a dimmed scrim like ModeInfoModal; a tap outside the card (or
 * "Done") dismisses. Presentation only — the panel owns the numbers and the
 * open/close state.
 */
export const SessionResultModal = ({
  visible,
  onDismiss,
  playerName,
  attempts,
  totalMs,
  avgMs,
}: {
  visible: boolean;
  onDismiss: () => void;
  /** The runner this session is attributed to, or null when unnamed. */
  playerName: string | null;
  attempts: number;
  totalMs: number;
  /** Mean reaction, or null when there were no attempts. */
  avgMs: number | null;
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
        testID="session-result-backdrop"
        accessibilityLabel="Dismiss session results"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card} testID="session-result">
        <AppText size={12} color={colors.textSecondary} style={styles.heading}>
          Session complete
        </AppText>

        {/* The runner's name headlines the card when one is set. */}
        {playerName != null && (
          <AppText size={22} weight="700" testID="session-result-player">
            {playerName}
          </AppText>
        )}

        <View style={styles.stats}>
          <Stat label="Hits" value={String(attempts)} testID="result-hits" />
          <Stat
            label="Total time"
            value={formatSeconds(totalMs)}
            testID="result-total"
          />
          <Stat
            label="Average"
            value={avgMs !== null ? formatSeconds(avgMs) : "—"}
            testID="result-average"
          />
        </View>

        <Button
          label="Done"
          primary
          testID="session-result-done"
          onPress={onDismiss}
          style={styles.done}
        />
      </View>
    </View>
  </Modal>
);

/** One label / value row in the results card. */
const Stat = ({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}) => (
  <View style={styles.row}>
    <AppText size={14} color={colors.textSecondary}>
      {label}
    </AppText>
    <AppText size={16} weight="700" testID={testID}>
      {value}
    </AppText>
  </View>
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
  stats: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  done: {
    alignSelf: "stretch",
    marginTop: 4,
  },
});
