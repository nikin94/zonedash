import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { HitRecord } from "../ble/contract";
import type {
  CentralTransport,
  DrillConfig,
  SessionState,
} from "../ble/transport";
import { AppText } from "../components/AppText";
import {
  CourtMap,
  SPOT_CODES,
  SPOT_NAMES,
  type SpotVisual,
} from "../components/CourtMap";
import { CustomPressable } from "../components/CustomPressable";
import { Header } from "../components/Header";
import { msOptions, WheelField } from "../components/WheelField";
import type { Nav } from "../navigation";
import { useAppState, type DrillSettings } from "../state/AppState";
import { colors } from "../theme";

const COUNT_OPTIONS = Array.from({ length: 99 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));
const DURATION_OPTIONS = msOptions(15000, 300000, 15000);

/** How long a resolved step's green flash stays on the map. Shorter than the
 *  engine's default step cadence so the flash clears before the next arm. */
const FLASH_MS = 450;

/** Reaction/aggregate times read as seconds with 2 decimals (e.g. "0.82 s").
 *  UNIT is a single knob — flip to "сек" here if a Cyrillic label is wanted. */
const UNIT = "s";
const fmtSec = (ms: number) => `${(ms / 1000).toFixed(2)} ${UNIT}`;

// Fixed footprints for the court-centre block, so idle → running → done never
// shifts the layout.
const TEXT_SLOT_H = 60; // 3 lines at lineHeight 20
const ERROR_SLOT_H = 18;
const BUTTON_H = 48;

/** UI modes. The engine's `random` and `time` differ only in the stop
 *  condition (rep count vs duration window), so the UI folds them into one
 *  Random mode with a stop-by selector — the wire mode is derived from it and
 *  the firmware DrillConfig is untouched. */
type UiMode = "random" | "path" | "live";
type StopBy = "count" | "time";

const MODES: { key: UiMode; label: string }[] = [
  { key: "random", label: "Random" },
  { key: "path", label: "Path" },
  { key: "live", label: "Live" },
];

/** One-line explanation shown under the mode selector. */
const MODE_DESC: Record<UiMode, string> = {
  random: "Targets light in a random order until the session ends.",
  path: "Run a fixed sequence you tap out on the map.",
  live: "Light targets by hand during the run — one tap each.",
};

/**
 * The drill screen — reached once a layout is paired. One court map does
 * double duty: while
 * idle it authors the drill (Path steps are tapped right on it), while running
 * it mirrors the central unit's Status events — `progress` arms a spot (radar
 * ping), `resolved` flashes it green, and the `done` session state pulls
 * DumpResults for the results panel. The drill config lives below the court; Start
 * composes it (mode + count/duration + the Settings-screen params) and sends
 * LoadDrill + StartSession in one go — no separate load step. No timeout goes
 * on the wire, so a run counts hits only — misses don't exist in the app.
 *
 * Drills operate on POSITIONS (slot indices from the pairing round):
 * `pairedSpots[i]` is the court spot bound to slot i, so an authored spot
 * translates to `indexOf` on the way out and `pairedSpots[position]` translates
 * events back onto the map.
 */
export const DrillPanel = ({
  transport,
  pairedSpots,
  settings,
}: {
  transport: CentralTransport;
  pairedSpots: number[]; // canonical spots in bind order (slot order)
  settings: DrillSettings;
}) => {
  const [uiMode, setUiMode] = useState<UiMode>("random");
  const [stopBy, setStopBy] = useState<StopBy>("count");
  const [count, setCount] = useState(10);
  const [durationMs, setDurationMs] = useState(30000);
  const [path, setPath] = useState<number[]>([]); // canonical spots, in order
  const [session, setSession] = useState<SessionState>("idle");
  // The mode the current records belong to, so a finished run's stats show
  // only while that mode is selected — switching modes hides them.
  const [runMode, setRunMode] = useState<UiMode>("random");
  const [armedSpot, setArmedSpot] = useState<number | null>(null); // canonical
  const [flashSpot, setFlashSpot] = useState<number | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  // Live mode: a target is armed or in flight after the operator's tap, so
  // further taps are ignored until it resolves.
  const [liveBusy, setLiveBusy] = useState(false);
  const [records, setRecords] = useState<HitRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "progress") {
        setArmedSpot(pairedSpots[e.position] ?? null);
      }
      if (e.kind === "resolved") {
        const spot = pairedSpots[e.position];
        setArmedSpot((was) => (was === spot ? null : was));
        setResolvedCount((n) => n + 1);
        setLastReactionMs(e.reactionMs);
        setLiveBusy(false); // ready for the next live pick
        if (spot != null) {
          setFlashSpot(spot);
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlashSpot(null), FLASH_MS);
        }
      }
      if (e.kind === "session") {
        setSession(e.state);
        if (e.state !== "running") setLiveBusy(false);
        if (e.state === "done") {
          setArmedSpot(null);
          // The run is over — pull the buffered hit records for the summary.
          transport.dumpResults().then(
            (r) => setRecords(r),
            () => setError("could not fetch results"),
          );
        }
      }
    });
    return () => {
      unsub();
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    };
  }, [transport, pairedSpots]);

  // A re-pair can drop spots the authored path referenced — without this, a
  // stale path would translate to position -1 (255 on the wire) and arm a
  // target that doesn't exist. Filter out vanished spots so the operator
  // re-checks what remains.
  useEffect(() => {
    setPath((prev) => {
      const kept = prev.filter((s) => pairedSpots.includes(s));
      return kept.length === prev.length ? prev : kept; // idempotent on fresh arrays
    });
  }, [pairedSpots]);

  const running = session === "running";
  const done = session === "done";

  const appendPathSpot = (spot: number) => {
    if (uiMode !== "path" || !pairedSpots.includes(spot)) return;
    setPath([...path, spot]);
  };

  const liveRunning = running && uiMode === "live";

  // The court map does double duty: authoring the Path while idle, and — in a
  // running live session — the operator's control surface. A live tap arms the
  // picked target; the central lights it a beat later. One at a time.
  const onCourtTap = (spot: number) => {
    if (!running) {
      appendPathSpot(spot);
      return;
    }
    if (liveRunning && !liveBusy && pairedSpots.includes(spot)) {
      setLiveBusy(true);
      transport
        .armLiveTarget(pairedSpots.indexOf(spot))
        .catch(() => setLiveBusy(false));
    }
  };

  // The engine mode this UI state resolves to on the wire.
  const wireMode: DrillConfig["mode"] =
    uiMode === "random" ? (stopBy === "time" ? "time" : "random") : uiMode;

  // Compose the config and run it — LoadDrill + StartSession in one tap.
  const start = () => {
    // Only the params the resolved mode actually uses go on the wire — the
    // engine would ignore the rest, but stale values must not leak. No
    // timeoutMs ever: undefined means no auto-miss (engine semantics).
    const config: DrillConfig = {
      mode: wireMode,
      numPositions: pairedSpots.length,
    };
    if (wireMode !== "live") config.delayMs = settings.delayMs;
    if (wireMode === "random" || wireMode === "time") {
      config.allowImmediateRepeat = settings.allowImmediateRepeat;
    }
    if (wireMode === "random") config.count = count;
    if (wireMode === "time") config.durationMs = durationMs;
    if (wireMode === "path") {
      // Positions are slot indices — translate the authored canonical spots.
      const positions = path.map((s) => pairedSpots.indexOf(s));
      // Belt and braces over the re-pair effect above: a -1 here would go out
      // as position 255 and arm a target that doesn't exist.
      if (positions.some((p) => p < 0)) {
        setError("path references unpaired spots — re-author it");
        return;
      }
      config.path = positions;
    }

    setRunMode(uiMode);
    setError(null);
    setRecords(null);
    setResolvedCount(0);
    setLastReactionMs(null);
    setFlashSpot(null);
    setLiveBusy(false);
    transport
      .loadDrill(config)
      .then(() => transport.startSession())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "start failed");
      });
  };

  // Aborting keeps the partial records — the central reads it as done, so the
  // summary still lands via the session event above.
  const stop = () => {
    transport.stopSession().catch(() => {});
  };

  const visuals: SpotVisual[] = Array.from({ length: 8 }, (_, i) => {
    if (!pairedSpots.includes(i)) return "off";
    if (flashSpot === i) return "hit";
    // A lit exercise target gets the radar ping ("react"), never the pairing
    // spinner ("loading").
    if (running && armedSpot === i) return "armed";
    // While idle the map is the Path authoring surface.
    if (!running && uiMode === "path" && path.includes(i)) return "selected";
    return "available";
  });

  const canStart = uiMode !== "path" || path.length > 0;
  // A finished run's court state and results belong to the mode they ran in:
  // switching to another mode reads as fresh (Start), and the stats stay tied
  // to their own mode until that mode runs again.
  const showDone = done && uiMode === runMode;
  const attempts = records ?? [];
  const totalMs = attempts.reduce((s, r) => s + r.reactionMs, 0);
  const avgMs =
    attempts.length > 0 ? totalMs / attempts.length : null;

  // The canonical spot a record's slot maps back to, as a two-letter code.
  const attemptCode = (position: number) => {
    const spot = pairedSpots[position];
    return spot != null ? SPOT_CODES[spot] : "—";
  };

  // Secondary status line during a run. Auto modes narrate the athlete's
  // reaction; live mode narrates the operator's turn: tap → armed → time.
  const runStatus = liveRunning
    ? liveBusy
      ? "Hit the lit target"
      : lastReactionMs !== null
        ? fmtSec(lastReactionMs)
        : "Tap a target to arm it"
    : lastReactionMs === null
      ? "React when a target lights up"
      : fmtSec(lastReactionMs);
  const runStatusHit = !liveBusy && lastReactionMs !== null;

  return (
    <ScrollView
      contentContainerStyle={styles.panel}
      showsVerticalScrollIndicator={false}
    >
      <CourtMap
        spots={visuals}
        onPressSpot={
          liveRunning || (!running && uiMode === "path") ? onCourtTap : undefined
        }
      >
        <View style={styles.textSlot}>
          {running ? (
            <>
              <AppText center size={16} weight="600" style={styles.slotText}>
                Step {resolvedCount + 1}
              </AppText>
              <AppText
                center
                size={13}
                color={runStatusHit ? colors.success : colors.textMuted}
                style={styles.slotText}
              >
                {runStatus}
              </AppText>
            </>
          ) : showDone && records !== null ? (
            // Numbers live in the results panel below — the court just marks
            // the session done, so the map stays uncluttered.
            <AppText center size={16} weight="600" style={styles.slotText}>
              Session complete
            </AppText>
          ) : showDone ? (
            <AppText center size={13} color={colors.textMuted} style={styles.slotText}>
              Fetching results…
            </AppText>
          ) : (
            <AppText center size={13} color={colors.textMuted} style={styles.slotText}>
              Pick a drill below, then Start
            </AppText>
          )}
        </View>

        <View style={styles.errorSlot}>
          {error !== null && (
            <AppText center size={13} numberOfLines={1} color={colors.danger}>
              {error}
            </AppText>
          )}
        </View>

        {running ? (
          <CustomPressable onPress={stop} style={styles.button}>
            <AppText size={16} weight="600">
              Stop
            </AppText>
          </CustomPressable>
        ) : (
          <CustomPressable
            disabled={!canStart}
            onPress={start}
            style={[styles.button, !canStart && styles.buttonDisabled]}
          >
            <AppText size={16} weight="600">
              {showDone ? "Run again" : "Start"}
            </AppText>
          </CustomPressable>
        )}
      </CourtMap>

      {/* The drill config lives under the court; locked while a run is on so
          the loaded drill always matches what is on screen. */}
      <View
        pointerEvents={running ? "none" : "auto"}
        style={[styles.config, running && styles.dimmed]}
      >
        <View style={styles.stopRow}>
          <AppText color={colors.textSecondary} style={styles.paramLabel}>
            Mode
          </AppText>
          <View style={styles.stopChips}>
            {MODES.map((m) => (
              <CustomPressable
                key={m.key}
                noFeedback
                accessibilityState={{ selected: uiMode === m.key }}
                onPress={() => setUiMode(m.key)}
                style={[styles.modeChip, uiMode === m.key && styles.modeChipActive]}
              >
                <AppText
                  weight="600"
                  color={uiMode === m.key ? colors.accentText : colors.textSecondary}
                >
                  {m.label}
                </AppText>
              </CustomPressable>
            ))}
          </View>
        </View>
        <AppText center size={12} color={colors.textMuted} testID="mode-desc">
          {MODE_DESC[uiMode]}
        </AppText>

        {uiMode === "random" && (
          <>
            <View style={styles.stopRow}>
              <AppText color={colors.textSecondary} style={styles.paramLabel}>
                Session length
              </AppText>
              <View style={styles.stopChips}>
                {(
                  [
                    { key: "count", label: "Hits" },
                    { key: "time", label: "Time" },
                  ] as const
                ).map((s) => (
                  <CustomPressable
                    key={s.key}
                    noFeedback
                    accessibilityState={{ selected: stopBy === s.key }}
                    onPress={() => setStopBy(s.key)}
                    style={[styles.stopChip, stopBy === s.key && styles.modeChipActive]}
                  >
                    <AppText
                      weight="600"
                      color={
                        stopBy === s.key ? colors.accentText : colors.textSecondary
                      }
                    >
                      {s.label}
                    </AppText>
                  </CustomPressable>
                ))}
              </View>
            </View>
            {stopBy === "count" ? (
              <WheelField
                value={count}
                label="Targets to hit"
                testID="drill-count"
                options={COUNT_OPTIONS}
                onChange={setCount}
              />
            ) : (
              <WheelField
                value={durationMs}
                label="Duration"
                testID="drill-duration"
                options={DURATION_OPTIONS}
                onChange={setDurationMs}
              />
            )}
          </>
        )}

        {uiMode === "path" &&
          (path.length > 0 ? (
            <>
              <AppText center size={13} color={colors.accentText} testID="path-sequence">
                {path.map((s) => SPOT_NAMES[s]).join(" → ")}
              </AppText>
              <View style={styles.pathActions}>
                <CustomPressable
                  onPress={() => setPath(path.slice(0, -1))}
                  style={styles.smallButton}
                >
                  <AppText size={15} weight="600">
                    Undo
                  </AppText>
                </CustomPressable>
                <CustomPressable onPress={() => setPath([])} style={styles.smallButton}>
                  <AppText size={15} weight="600">
                    Clear
                  </AppText>
                </CustomPressable>
              </View>
            </>
          ) : (
            <AppText center size={13} color={colors.textMuted}>
              Tap paired spots on the map in the order to run
            </AppText>
          ))}
      </View>

      {showDone && records !== null && (
        <View style={styles.stats} testID="stats-panel">
          <AppText size={12} color={colors.textSecondary} style={styles.heading}>
            Results
          </AppText>
          {attempts.length > 0 ? (
            // No inner scroll — the whole screen scrolls, so the list just
            // grows and every attempt is one page-scroll away.
            <View testID="attempt-list" style={styles.attemptList}>
              {attempts.map((r, i) => (
                <View key={r.seq} style={styles.statRow}>
                  <View style={styles.attemptLead}>
                    <AppText size={13} color={colors.textMuted}>
                      Attempt {i + 1}
                    </AppText>
                    <AppText
                      size={13}
                      weight="600"
                      color={colors.accentText}
                      accessibilityLabel={SPOT_NAMES[pairedSpots[r.position]!]}
                    >
                      {attemptCode(r.position)}
                    </AppText>
                  </View>
                  <AppText size={13} weight="600">
                    {fmtSec(r.reactionMs)}
                  </AppText>
                </View>
              ))}
            </View>
          ) : (
            <AppText center size={13} color={colors.textMuted}>
              No attempts recorded
            </AppText>
          )}
          <View style={styles.statDivider} />
          <View style={styles.statRow}>
            <AppText size={13} color={colors.textSecondary}>
              Total time
            </AppText>
            <AppText size={13} weight="600">
              {fmtSec(totalMs)}
            </AppText>
          </View>
          <View style={styles.statRow}>
            <AppText size={13} color={colors.textSecondary}>
              Average
            </AppText>
            <AppText size={13} weight="600">
              {avgMs !== null ? fmtSec(avgMs) : "—"}
            </AppText>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

/** The Drill screen: Header + the drill panel, gated on the link and the
 *  paired layout (a drill runs on the layout the pairing round bound). */
export const DrillScreen = () => {
  const navigation = useNavigation<Nav>();
  const { transport, connection, pairedSpots, settings } = useAppState();
  const connected = connection === "connected";
  const paired = pairedSpots.length > 0;

  // A drill only makes sense over a live link and a paired layout. Losing
  // either (link drop, layout cleared) sends the operator back home, where
  // the unpaired redirect takes over if the link is still up.
  useFocusEffect(
    useCallback(() => {
      if (!connected || !paired) navigation.popToTop();
    }, [connected, paired, navigation]),
  );

  return (
    <View style={styles.screen}>
      <Header back title="Drill" />
      {connected && paired && (
        <DrillPanel
          transport={transport}
          pairedSpots={pairedSpots}
          settings={settings}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56, // clears the status bar without a safe-area dependency
  },
  panel: {
    marginTop: 16,
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  textSlot: {
    height: TEXT_SLOT_H,
    justifyContent: "center",
  },
  slotText: {
    lineHeight: 20,
  },
  errorSlot: {
    height: ERROR_SLOT_H,
    justifyContent: "center",
  },
  button: {
    height: BUTTON_H,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 32,
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  dimmed: {
    opacity: 0.4,
  },
  config: {
    alignSelf: "stretch",
    gap: 12,
    marginTop: 8,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  stats: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attemptList: {
    gap: 8,
  },
  attemptLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  stopRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stopChips: {
    flexDirection: "row",
    gap: 8,
  },
  stopChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  paramLabel: {
    flexShrink: 1,
  },
  pathActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  smallButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
