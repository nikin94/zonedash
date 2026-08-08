import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { HitRecord } from "../../ble/contract";
import type {
  CentralTransport,
  DrillConfig,
  SessionState,
} from "../../ble/transport";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { MAX_DRILL_PATH } from "../../ble/codec";
import { CourtMap, SpotIcon } from "../CourtMap";
import { msOptions, WheelField } from "../WheelField";
import { SPOT_CODES, SPOT_NAMES } from "../../domain/spot";
import { summarize, type SessionSummary } from "../../domain/session";
import { type SpotVisual } from "../../helpers/court";
import { type DrillSettings } from "../../state/AppState";
import { colors } from "../../theme";

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

/** Inverse of `wireMode`: the UI mode + stop-by a wire config resolves back to,
 *  so a mount over a running/finished session restores the matching controls. */
const uiFromWire = (
  mode: DrillConfig["mode"],
): { uiMode: UiMode; stopBy: StopBy } => {
  if (mode === "time") return { uiMode: "random", stopBy: "time" };
  if (mode === "path") return { uiMode: "path", stopBy: "count" };
  if (mode === "live") return { uiMode: "live", stopBy: "count" };
  return { uiMode: "random", stopBy: "count" };
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
  rotation,
  onRotate,
  onSessionComplete,
}: {
  transport: CentralTransport;
  pairedSpots: number[]; // canonical spots in bind order (slot order)
  settings: DrillSettings;
  /** Court view orientation + its rotate control, threaded to the map (see CourtMap). */
  rotation?: number;
  onRotate?: () => void;
  /** Called once when a run finishes with at least one attempt, so the app can
   *  log it to the session history. The panel builds the summary; persistence is
   *  the caller's. */
  onSessionComplete?: (summary: SessionSummary) => void;
}) => {
  // Read the central's session ONCE at mount and, if a run is in progress, seed
  // state from it — so a remount over a live run reflects it (running, armed
  // target, Stop, step count) instead of a stale idle Start screen with no way
  // to stop the background run. The central only re-emits `running` on
  // StartSession, never on (re)mount. Same UI-cache-vs-truth fix as
  // pairedSpots, on the session axis. Scoped to `running`: a finished session
  // rehydrates to a fresh idle Start (the operator left; re-authoring is the
  // likely next step, and its records were never theirs to keep across a leave).
  const [snap] = useState(() => transport.sessionSnapshot);
  const live = snap.state === "running";
  const ui = uiFromWire(snap.mode);

  const [uiMode, setUiMode] = useState<UiMode>(live ? ui.uiMode : "random");
  const [stopBy, setStopBy] = useState<StopBy>(live ? ui.stopBy : "count");
  // Seed the config params from the snapshot too, so a rehydrated run keeps the
  // numbers it actually ran with — otherwise `Run again` breaks for path (empty
  // sequence) and random/time show the defaults, not what's on the wire. The
  // snapshot path is slot indices; the panel holds canonical spots, so map back.
  const [count, setCount] = useState(live ? (snap.count ?? 10) : 10);
  const [durationMs, setDurationMs] = useState(
    live ? (snap.durationMs ?? 30000) : 30000,
  );
  const [path, setPath] = useState<number[]>(
    live && snap.path
      ? snap.path
          .map((p) => pairedSpots[p])
          .filter((s): s is number => s != null)
      : [],
  ); // canonical spots, in order
  const [session, setSession] = useState<SessionState>(
    live ? "running" : "idle",
  );
  // The mode the current records belong to, so a finished run's stats show
  // only while that mode is selected — switching modes hides them.
  const [runMode, setRunMode] = useState<UiMode>(live ? ui.uiMode : "random");
  const [armedSpot, setArmedSpot] = useState<number | null>(
    live && snap.armedPosition != null
      ? (pairedSpots[snap.armedPosition] ?? null)
      : null,
  ); // canonical
  const [flashSpot, setFlashSpot] = useState<number | null>(null);
  const [resolvedCount, setResolvedCount] = useState(
    live ? snap.resolvedCount : 0,
  );
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  // Live mode: a target is armed or in flight after the operator's tap, so
  // further taps are ignored until it resolves. Seed busy from a lit target so
  // a remount can't arm a second one over the one already up.
  const [liveBusy, setLiveBusy] = useState(live && snap.armedPosition != null);
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
    // Bound the path so a LoadDrill write always fits one ATT MTU (see
    // MAX_DRILL_PATH). The cap sits far above any real drill, so a tap only
    // no-ops in the pathological case — the hint below tells the operator why.
    if (path.length >= MAX_DRILL_PATH) return;
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
  const avgMs = attempts.length > 0 ? totalMs / attempts.length : null;

  // Log a finished run to the session history — once per session, exactly when
  // its records land (records goes null -> array once per done, and resets to
  // null on the next Start). Keyed on the records object identity so an
  // unrelated re-render (e.g. a re-pair) can't re-log the same session; skipped
  // for a 0-attempt run (an aborted drill nobody reacted in isn't worth a row).
  const loggedRef = useRef<HitRecord[] | null>(null);
  useEffect(() => {
    if (!done || records === null || records.length === 0) return;
    if (loggedRef.current === records) return;
    loggedRef.current = records;
    onSessionComplete?.(
      summarize(records, {
        endedAt: Date.now(),
        mode: runMode, // the mode that actually ran (stable through done)
        numPositions: pairedSpots.length,
      }),
    );
  }, [done, records, runMode, pairedSpots, onSessionComplete]);

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
          liveRunning || (!running && uiMode === "path")
            ? onCourtTap
            : undefined
        }
        rotation={rotation}
        onRotate={onRotate}
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
            <AppText
              center
              size={13}
              color={colors.textMuted}
              style={styles.slotText}
            >
              Fetching results…
            </AppText>
          ) : (
            <AppText
              center
              size={13}
              color={colors.textMuted}
              style={styles.slotText}
            >
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
          <Button label="Stop" onPress={stop} style={styles.runButton} />
        ) : (
          <Button
            label={showDone ? "Run again" : "Start"}
            disabled={!canStart}
            onPress={start}
            style={styles.runButton}
          />
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
              <Button
                key={m.key}
                label={m.label}
                size="small"
                textSize={14}
                noFeedback
                selected={uiMode === m.key}
                textColor={colors.textSecondary}
                onPress={() => setUiMode(m.key)}
              />
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
                  <Button
                    key={s.key}
                    label={s.label}
                    size="small"
                    textSize={14}
                    noFeedback
                    selected={stopBy === s.key}
                    textColor={colors.textSecondary}
                    onPress={() => setStopBy(s.key)}
                  />
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
              <AppText
                center
                size={13}
                color={colors.accentText}
                testID="path-sequence"
              >
                {path.map((s) => SPOT_NAMES[s]).join(" → ")}
              </AppText>
              {path.length >= MAX_DRILL_PATH && (
                <AppText
                  center
                  size={12}
                  color={colors.textMuted}
                  testID="path-full"
                >
                  Path is full — Undo a step to change it
                </AppText>
              )}
              <View style={styles.pathActions}>
                <Button
                  label="Undo"
                  size="small"
                  textSize={15}
                  onPress={() => setPath(path.slice(0, -1))}
                />
                <Button
                  label="Clear"
                  size="small"
                  textSize={15}
                  onPress={() => setPath([])}
                />
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
          <AppText
            size={12}
            color={colors.textSecondary}
            style={styles.heading}
          >
            Results
          </AppText>
          {attempts.length > 0 ? (
            // No inner scroll — the whole screen scrolls, so the list just
            // grows and every attempt is one page-scroll away.
            <View testID="attempt-list" style={styles.attemptList}>
              {attempts.map((r, i) => {
                // The canonical spot the record's slot maps back to. Guarded
                // once here so the number, icon, code and SR-label all degrade
                // the same way if it is ever out of range.
                const spot = pairedSpots[r.position];
                return (
                  <View key={r.seq} style={styles.statRow}>
                    <View style={styles.attemptLead}>
                      <AppText
                        size={13}
                        color={colors.textMuted}
                        style={styles.attemptNum}
                        accessibilityLabel={`Attempt ${i + 1}`}
                      >
                        {i + 1}
                      </AppText>
                      <SpotIcon spot={spot} />
                      <AppText
                        size={13}
                        weight="600"
                        color={colors.accentText}
                        accessibilityLabel={
                          spot != null ? SPOT_NAMES[spot] : "unknown spot"
                        }
                      >
                        {spot != null ? SPOT_CODES[spot] : "—"}
                      </AppText>
                    </View>
                    <AppText size={13} weight="600">
                      {fmtSec(r.reactionMs)}
                    </AppText>
                  </View>
                );
              })}
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

const styles = StyleSheet.create({
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
    // Seat the status at the BOTTOM of its fixed slot so a short line (e.g.
    // "Session complete") sits close to the button below instead of floating
    // centred with a wide gap. The height stays fixed, so no cross-phase jump.
    justifyContent: "flex-end",
  },
  slotText: {
    lineHeight: 20,
  },
  errorSlot: {
    height: ERROR_SLOT_H,
    justifyContent: "center",
  },
  // The in-court Start/Stop/Run again button — the shared Button owns its
  // chrome and disabled state; this only spaces it below the status slots.
  runButton: {
    marginTop: 8,
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
  attemptNum: {
    minWidth: 20, // fixed lead so rows align as the count reaches two digits
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
  paramLabel: {
    flexShrink: 1,
  },
  pathActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
});
