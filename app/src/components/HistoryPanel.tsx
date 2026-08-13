import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { MAX_TARGETS } from "../ble/codec";
import { bestAverageSessionId, type SessionSummary } from "../domain/session";
import { formatSeconds, formatSessionTime } from "../helpers/time";
import { loadHistory } from "../state/history";
import { colors } from "../theme";
import { AppText } from "./AppText";

const fmtSec = (ms: number | null) => (ms === null ? "—" : formatSeconds(ms));

/** Title-case the stored UI mode label ("random" -> "Random"). */
const fmtMode = (mode: string) =>
  mode.length > 0 ? mode[0].toUpperCase() + mode.slice(1) : mode;

/** The sub-line under a session's mode: when · hits [· targets]. Time is an
 *  absolute stamp (formatSessionTime); the target count comes LAST and only for
 *  a reduced layout (the full MAX_TARGETS layout is the default, so "8 targets"
 *  is noise). */
const fmtMeta = (s: SessionSummary, now: number) => {
  const hits = `${s.attempts} ${s.attempts === 1 ? "hit" : "hits"}`;
  const parts = [formatSessionTime(s.endedAt, now), hits];
  if (s.numPositions < MAX_TARGETS) parts.push(`${s.numPositions} targets`);
  return parts.join(" · ");
};

/**
 * Session-history list — newest first, with a "best" badge on the fastest
 * average. Reads the device-local log (history.ts) on mount and whenever
 * `refreshKey` changes, so the History screen can re-pull it on tab focus (a
 * session finished on the Drill tab shows up next time this is focused) and
 * after a clear. It reports its loaded count up via `onLoaded`, so the screen's
 * overflow menu (which owns the Clear flow) can hide when there is nothing to
 * clear. Pure list: the screen title and the Clear action live on the screen.
 *
 * An optional `mode` filters the rendered rows to one drill mode (the mode tab
 * bar drives it). The loaded count reported via `onLoaded` is ALWAYS the total
 * across every mode, so the screen's Clear affordance (which wipes the whole
 * identity bucket) still shows while the active mode tab happens to be empty.
 */
export const HistoryPanel = ({
  refreshKey = 0,
  userId = null,
  mode,
  onLoaded,
}: {
  refreshKey?: number;
  /** Whose history to show: the signed-in account's bucket, or the anonymous
   *  device log (null). Re-reads when it changes, so a sign-in/out swaps the
   *  list to the matching identity's history. */
  userId?: string | null;
  /** Show only sessions of this drill mode (the history mode tab). Undefined =
   *  show every mode (the panel used without a tab bar). */
  mode?: string;
  /** Reports the TOTAL loaded session count (all modes) on every (re)read — the
   *  screen gates its Clear affordance on it. */
  onLoaded?: (count: number) => void;
}) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  // The clock the relative labels read against — stamped on each (re)load.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    setNow(Date.now());
    loadHistory(userId).then((s) => {
      if (live) {
        setSessions(s);
        onLoaded?.(s.length);
      }
    });
    return () => {
      live = false;
    };
    // Re-read on refreshKey or an identity swap; onLoaded is a plain reporter.
  }, [refreshKey, userId]);

  // Filter to the active mode when one is given; otherwise show every session.
  const shown =
    mode === undefined ? sessions : sessions.filter((s) => s.mode === mode);

  // The fastest-average session gets a "best" badge — progression at a glance;
  // null (no badge) until there are two comparable sessions. Scoped to the shown
  // set, so a mode tab badges the best OF THAT MODE, comparing like with like.
  const bestId = bestAverageSessionId(shown);

  return (
    <View style={styles.panel}>
      {shown.length === 0 ? (
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
        <View style={styles.list} testID="history-list">
          {shown.map((s) => (
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
                {s.playerName != null && (
                  <AppText
                    size={13}
                    weight="600"
                    numberOfLines={1}
                    testID={`history-player-${s.id}`}
                  >
                    {s.playerName}
                  </AppText>
                )}
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
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    alignSelf: "stretch",
    paddingHorizontal: 24,
    gap: 12,
  },
  empty: {
    paddingVertical: 12,
  },
  list: {
    alignSelf: "stretch",
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
});
