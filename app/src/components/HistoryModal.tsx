import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";

import { MAX_TARGETS } from "../ble/codec";
import { bestAverageSessionId, type SessionSummary } from "../domain/session";
import { formatRelativeTime } from "../helpers/time";
import { clearHistory, loadHistory } from "../state/history";
import { alpha, colors, glowShadow } from "../theme";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";
import { CustomPressable } from "./CustomPressable";

const UNIT = "s";
const fmtSec = (ms: number | null) =>
  ms === null ? "—" : `${(ms / 1000).toFixed(2)} ${UNIT}`;

/** Title-case the stored UI mode label ("random" -> "Random"). */
const fmtMode = (mode: string) =>
  mode.length > 0 ? mode[0].toUpperCase() + mode.slice(1) : mode;

/** The sub-line under a session's mode: when · [targets ·] hits. The time is
 *  relative ("2m ago"), read against `now`. The target count is only worth
 *  noting when the layout was reduced — the full MAX_TARGETS layout is the
 *  default, so "8 targets" is noise. */
const fmtMeta = (s: SessionSummary, now: number) => {
  const hits = `${s.attempts} ${s.attempts === 1 ? "hit" : "hits"}`;
  const parts = [formatRelativeTime(s.endedAt, now)];
  if (s.numPositions < MAX_TARGETS) parts.push(`${s.numPositions} targets`);
  parts.push(hits);
  return parts.join(" · ");
};

/**
 * Past drill sessions, newest first — a centered modal (same scrim + card
 * treatment as SettingsModal), opened from the header. Loads the device-local
 * log each time it opens (history.ts), so it reflects sessions finished since
 * last opened without any app-wide subscription. Clear wipes the log behind a
 * confirm.
 */
export const HistoryModal = ({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [clearAsk, setClearAsk] = useState(false);
  // The clock the relative labels are read against — stamped when the modal
  // opens (and its data loads), so "2m ago" reflects the moment it's shown.
  const [now, setNow] = useState(() => Date.now());

  // Reload on each open — a session finished while this was closed should be
  // there next time it opens.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setNow(Date.now());
    loadHistory().then((s) => {
      if (live) setSessions(s);
    });
    return () => {
      live = false;
    };
  }, [visible]);

  // The fastest-average session gets a "best" badge — progression at a glance.
  // null (and thus no badge) until there are two comparable sessions.
  const bestId = bestAverageSessionId(sessions);

  const confirmClear = () => {
    setClearAsk(false);
    void clearHistory();
    setSessions([]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.scrim}>
        <CustomPressable
          noFeedback
          testID="history-backdrop"
          accessibilityLabel="Dismiss history"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.card}>
          <AppText size={12} color={colors.textSecondary} style={styles.heading}>
            Session history
          </AppText>

          {sessions.length === 0 ? (
            <AppText
              center
              size={13}
              color={colors.textMuted}
              style={styles.empty}
              testID="history-empty"
            >
              No sessions yet — finish a drill and it lands here.
            </AppText>
          ) : (
            <ScrollView
              style={styles.list}
              testID="history-list"
              contentContainerStyle={styles.listContent}
            >
              {sessions.map((s) => (
                <View key={s.id} style={styles.row} testID={`history-row-${s.id}`}>
                  <View style={styles.rowLead}>
                    <View style={styles.modeLine}>
                      <AppText size={14} weight="600">
                        {fmtMode(s.mode)}
                      </AppText>
                      {s.id === bestId && (
                        <AppText
                          size={11}
                          weight="700"
                          color={colors.accentText}
                          style={styles.bestBadge}
                          testID={`history-best-${s.id}`}
                          accessibilityLabel="Fastest average so far"
                        >
                          ★ best
                        </AppText>
                      )}
                    </View>
                    <AppText size={12} color={colors.textMuted}>
                      {fmtMeta(s, now)}
                    </AppText>
                  </View>
                  <View style={styles.rowStats}>
                    <AppText size={14} weight="600">
                      {fmtSec(s.avgMs)}
                    </AppText>
                    <AppText size={12} color={colors.textMuted}>
                      best {fmtSec(s.bestMs)}
                    </AppText>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {sessions.length > 0 && (
            <Button
              label="Clear history"
              size="small"
              danger
              onPress={() => setClearAsk(true)}
              style={styles.clear}
            />
          )}
        </View>
      </View>

      <ConfirmModal
        visible={clearAsk}
        onDismiss={() => setClearAsk(false)}
        testID="clear-history-confirm"
        title="Clear session history?"
        body="This permanently removes every saved session on this device."
        actions={[
          { label: "Keep", onPress: () => setClearAsk(false) },
          { label: "Clear", danger: true, onPress: confirmClear },
        ]}
      />
    </Modal>
  );
};

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
    maxHeight: "80%",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
    ...glowShadow,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  empty: {
    paddingVertical: 12,
  },
  list: {
    alignSelf: "stretch",
  },
  listContent: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLead: {
    flexShrink: 1,
    gap: 2,
  },
  modeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // A quiet accent pill — noticed, not shouted, since every list has exactly one.
  bestBadge: {
    letterSpacing: 0.5,
    backgroundColor: colors.accentSurface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
  rowStats: {
    alignItems: "flex-end",
    gap: 2,
  },
  clear: {
    alignSelf: "center",
  },
});
