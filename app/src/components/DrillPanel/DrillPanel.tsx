import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import type { HitRecord } from "../../ble/contract";
import type {
  CentralTransport,
  DrillConfig,
  SessionState,
} from "../../ble/transport";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { GearIcon } from "../Icons";
import { PathChipStrip, type PathChipStripHandle } from "./PathChipStrip";
import { ModeInfoModal } from "./ModeInfoModal";
import { DrillSetupPage } from "./DrillSetupPage";
import {
  MODES,
  MODE_DESC,
  drillSummary,
  uiFromWire,
  type StopBy,
  type UiMode,
} from "./drillMode";
import { MAX_DRILL_PATH } from "../../ble/codec";
import { CourtMap, SpotIcon } from "../CourtMap";
import { SPOT_CODES, SPOT_NAMES } from "../../domain/spot";
import { summarize, type SessionSummary } from "../../domain/session";
import {
  COURT_ACTION_GAP,
  COURT_STRIP_H,
  type SpotVisual,
} from "../../helpers/court";
import { formatStepBadge } from "../../helpers/pathBadge";
import { type DrillSettings } from "../../state/AppState";
import { showToast } from "../../state/toast";
import {
  TAB_BAR_DISC_RISE,
  tabBarClearance,
} from "../../navigation/GlassTabBar";
import { alpha, colors } from "../../theme";

/** How long a resolved step's green flash stays on the map. Shorter than the
 *  engine's default step cadence so the flash clears before the next arm. */
const FLASH_MS = 450;

/** Reaction/aggregate times read as seconds with 2 decimals (e.g. "0.82 s").
 *  UNIT is a single knob — flip to "сек" here if a Cyrillic label is wanted. */
const UNIT = "s";
const fmtSec = (ms: number) => `${(ms / 1000).toFixed(2)} ${UNIT}`;

// Fixed footprints for the court-centre block, so idle → running → done never
// shifts the layout.
const TEXT_SLOT_H = 40; // fixed status area: room for the 2-line running status
// How long the "session complete" toast stays up (ms). Its own named knob —
// bump it here to change just this popup, independent of the TOAST_DEFAULT_MS
// every other toast inherits.
const SESSION_DONE_TOAST_MS = 3000;
// Breathing room between the last scrolled item and the tab bar's centre
// (Drill) disc, on top of the bar clearance (tabBarClearance + TAB_BAR_DISC_RISE).
const ACTION_BAR_GAP = 12;
// The vertical rhythm around the primary action: one gap unit, applied on both
// sides — from the court to Start, and from Start to the config band below.
// SHARED with the pairing surface (helpers/court) so the button sits the same
// distance under the court on every surface and stage.
const ACTION_GAP = COURT_ACTION_GAP;
// The panel column separates its children by this gap; the action block's own
// margins are computed against it (below) so the three ACTION_GAPs come out
// equal in the flex tree.
const PANEL_GAP = 8;
// CourtMap reserves an empty bottom strip below its court box (its net-line
// frame, CourtMap STRIP_H) when the net is on top — so the court→Start gap
// already carries it. The idle block pulls up by it to land on ACTION_GAP.
const COURT_BOTTOM_STRIP = COURT_STRIP_H;

// The Drill tab's own nested stack: the drill surface (DrillHome) plus the setup
// page pushed onto it. A real native-stack push slides the setup IN OVER the
// still-visible surface (and back on Done) — the navigator's own horizontal
// transition, no hand-rolled Modal + Animated.
const DrillNav = createNativeStackNavigator<{
  DrillHome: undefined;
  DrillSetup: undefined;
}>();

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
  onSettingsChange,
  rotation,
  onRotate,
  statusControl,
  onSessionComplete,
}: {
  transport: CentralTransport;
  pairedSpots: number[]; // canonical spots in bind order (slot order)
  settings: DrillSettings;
  /** Persist an edit to the session-wide drill settings (delay + immediate
   *  repeat) — driven from the drill setup page now that the Settings tab is
   *  gone. */
  onSettingsChange: (next: DrillSettings) => void;
  /** Court view orientation + its rotate control, threaded to the map (see CourtMap). */
  rotation?: number;
  onRotate?: () => void;
  /** Central-unit status affordance, threaded into the court corner. Injected by
   *  the screen (which owns the store) so this panel stays presentation-only. */
  statusControl?: ReactNode;
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
  const insets = useSafeAreaInsets();
  // The scrolling column extends under the FLOATING (translucent) tab bar, so
  // its bottom padding must clear the bar's full footprint plus the centre
  // disc's upward poke, plus a gap — otherwise the last item (Start, when the
  // config is short) sits under the bar. Derived from the bar's own exported
  // geometry so a bar resize can't silently re-hide it.
  const scrollPadBottom =
    tabBarClearance(insets.bottom) + TAB_BAR_DISC_RISE + ACTION_BAR_GAP;

  const [snap] = useState(() => transport.sessionSnapshot);
  const live = snap.state === "running";
  const ui = uiFromWire(snap.mode);

  const [uiMode, setUiMode] = useState<UiMode>(live ? ui.uiMode : "random");
  const [stopBy, setStopBy] = useState<StopBy>(live ? ui.stopBy : "count");
  // Seed the config params from the snapshot too, so a rehydrated run keeps the
  // numbers it actually ran with — otherwise re-running (Start after a finished
  // run) breaks for path (empty sequence) and random/time show the defaults,
  // not what's on the wire. The
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
  // Drives the step-chip strip so Undo can collapse the last chip with the same
  // animation a chip tap runs, instead of dropping the step instantly.
  const pathStripRef = useRef<PathChipStripHandle>(null);
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
  // The drill-modes explainer (opened from the info icon by the Mode selector).
  const [modeInfoOpen, setModeInfoOpen] = useState(false);
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

  // A finished run's summary describes ONE authored path over ONE pairing map.
  // But the court stays tappable after a run finishes (the operator authors
  // the next run) and the layout can change under it (a re-pair), so once the
  // path or the layout no longer matches the run the records came from, that
  // summary is stale — and worse, HitRecord.position is a slot index meaningless
  // without its session's map (domain/spot.ts), so old records rendered against
  // a new pairedSpots would point at the wrong court spots (even ones no longer
  // paired). Drop the summary the moment either changes, so the results can
  // never disagree with the authored path on screen. `path`/`pairedSpots` only
  // change outside a run (authoring is idle/done-only; a live tap arms, never
  // edits the path), and the `running` guard keeps a rehydrated live run's
  // snapshot-seeded counters on the one mount where session is already running.
  useEffect(() => {
    if (session === "running") return;
    setRecords(null);
    setResolvedCount(0);
    setLastReactionMs(null);
    setFlashSpot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear on path/layout change only, not on the session transition into it
  }, [path, pairedSpots]);

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

  // Order badges for the Path authoring surface: each selected spot carries its
  // step ordinal(s), so the sequence — and a spot reused across steps — reads on
  // the map. Spot 6 used at steps 1 and 3 shows "1·3"; a spot reused past the cap
  // elides its oldest steps to "…" so the newest stay legible on the dot
  // (formatStepBadge). Authoring only; a run's armed/hit visuals own the map.
  const showPathBadges = !running && uiMode === "path";
  const pathBadges: (string | null)[] | undefined = showPathBadges
    ? Array.from({ length: 8 }, (_, i) => {
        const steps = path.reduce<number[]>(
          (acc, s, idx) => (s === i ? [...acc, idx + 1] : acc),
          [],
        );
        return formatStepBadge(steps);
      })
    : undefined;

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

  // Announce a finished session through the header toast — the completion signal
  // no longer lives as a line under the court, so it surfaces even if the
  // operator has navigated to another tab. Fired exactly once per done
  // transition (a prevDone ref), so a re-render or a mode toggle while already
  // done can't re-fire it. `showToast` writes the toast store only, so this
  // never re-renders the panel.
  const prevDone = useRef(done);
  useEffect(() => {
    if (done && !prevDone.current) {
      showToast("Session complete", {
        tone: "success",
        durationMs: SESSION_DONE_TOAST_MS,
      });
    }
    prevDone.current = done;
  }, [done]);

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
    <DrillNav.Navigator
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    >
      <DrillNav.Screen name="DrillHome">
        {({ navigation }) => (
          <>
            <ScrollView
              testID="drill-surface"
              contentContainerStyle={[
                styles.panel,
                { paddingBottom: scrollPadBottom },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/* A clean court — its schema, targets, route and preview read
            unobstructed. The status line, drill config and the primary action
            all live OUTSIDE the court now: below it in the scrolling column. */}
              <CourtMap
                spots={visuals}
                badges={pathBadges}
                route={showPathBadges ? path : undefined}
                onPressSpot={
                  liveRunning || (!running && uiMode === "path")
                    ? onCourtTap
                    : undefined
                }
                rotation={rotation}
                onRotate={onRotate}
                statusControl={statusControl}
                hideOff
              />

              {/* Under the court: a settings gear beside the primary action
            (Start — constant label, even after a finished run — or Stop). The
            gear is an outline square (white fill, thick accent border) that
            fills the row's full height and stays square, so only the Start
            button's width flexes beside it. It opens the drill-setup page;
            disabled while a run is on, when the config is locked. The idle block
            carries the vertical rhythm so the action hugs the court. */}
              <View
                testID="action-block"
                style={[styles.actionBlock, !running && styles.actionBlockIdle]}
              >
                <View testID="action-row" style={styles.actionRow}>
                  <Button
                    disabled={running}
                    onPress={() => navigation.navigate("DrillSetup")}
                    testID="drill-settings-button"
                    accessibilityLabel="Drill setup"
                    style={styles.settingsButton}
                  >
                    <GearIcon size={22} color={colors.accent} />
                  </Button>
                  {running ? (
                    <Button
                      label="Stop"
                      onPress={stop}
                      danger
                      textSize={17}
                      testID="primary-action"
                      style={styles.actionButton}
                    />
                  ) : (
                    // Start carries a second line INSIDE the button — a muted caption
                    // naming what will run (mode + its key param: "Random · 10 hits",
                    // "Path"), so the setup reads at a glance without opening the gear.
                    <Button
                      primary
                      disabled={!canStart}
                      onPress={start}
                      testID="primary-action"
                      accessibilityLabel={`Start — ${drillSummary(uiMode, stopBy, count, durationMs)}`}
                      style={styles.actionButton}
                    >
                      <View style={styles.startContent}>
                        <AppText
                          center
                          size={17}
                          weight="600"
                          color={colors.background}
                        >
                          Start
                        </AppText>
                        <AppText
                          center
                          size={11}
                          color={alpha(colors.background, 0.7)}
                          testID="mode-summary"
                          style={styles.startSummary}
                        >
                          {drillSummary(uiMode, stopBy, count, durationMs)}
                        </AppText>
                      </View>
                    </Button>
                  )}
                </View>
              </View>

              {/* Status line — only WHILE a run is live (Step + reaction). Completion
            is announced by the header toast now, not a line here, and the
            numbers live in the results panel below — so a finished run shows
            nothing in this slot. Fixed height so the two-line running status
            never nudges the config below. */}
              {running && (
                <View testID="status-slot" style={styles.statusSlot}>
                  <AppText
                    center
                    size={16}
                    weight="600"
                    style={styles.slotText}
                  >
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
                </View>
              )}

              {error !== null && (
                <AppText
                  center
                  size={13}
                  numberOfLines={1}
                  color={colors.danger}
                  style={styles.errorLine}
                >
                  {error}
                </AppText>
              )}

              {/* Under the court: only the Path sequence authoring stays here (the
          operator taps the court, so its chips belong beside it). Mode and the
          Random params moved to the drill-setup page behind the gear. Locked
          while a run is on so the loaded drill always matches what is on screen. */}
              <View
                pointerEvents={running ? "none" : "auto"}
                style={[styles.config, running && styles.dimmed]}
              >
                {uiMode === "path" &&
                  (path.length > 0 ? (
                    <>
                      {/* Ordered step chips — the sequence, in order, each removable by
                  a tap (a targeted delete the map badges point back to). A
                  repeat shows twice, so the sequence stays unambiguous. The
                  strip scrolls (the path can run to MAX_DRILL_PATH steps) and
                  fades its overflowing edges so it reads as scrollable, not a
                  row silently running off-screen; it auto-scrolls to the end on
                  each append so the newest steps stay in view. */}
                      <PathChipStrip
                        ref={pathStripRef}
                        path={path}
                        onRemove={(idx) =>
                          setPath((p) => p.filter((_, j) => j !== idx))
                        }
                      />
                      {path.length >= MAX_DRILL_PATH && (
                        <AppText
                          center
                          size={12}
                          color={colors.textMuted}
                          testID="path-full"
                        >
                          Path is full — remove a step to change it
                        </AppText>
                      )}
                      <View style={styles.pathActions}>
                        <Button
                          label="Undo"
                          size="small"
                          textSize={15}
                          // Collapse the last chip (same animation as tapping it), which
                          // fires onRemove for that index when the slide-out completes.
                          onPress={() => pathStripRef.current?.removeLast()}
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
                                  spot != null
                                    ? SPOT_NAMES[spot]
                                    : "unknown spot"
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
          </>
        )}
      </DrillNav.Screen>

      {/* Present the setup as a native modal (`transparentModal`), NOT a card:
          react-native-screens presents it at the window level, so it sits ABOVE
          the floating tab bar (which lives in the parent tab navigator) with no
          hand-rolled hiding — the tab bar simply can't cover it. `transparentModal`
          defaults to a vertical (bottom-up) modal animation, so set the horizontal
          slide EXPLICITLY here — otherwise it ignores the navigator's inherited
          `slide_from_right`. The drill surface stays visible behind it. */}
      <DrillNav.Screen
        name="DrillSetup"
        options={{
          presentation: "transparentModal",
          animation: "slide_from_right",
        }}
      >
        {({ navigation }) => (
          <>
            <DrillSetupPage
              onDone={() => navigation.goBack()}
              onModeInfo={() => setModeInfoOpen(true)}
              uiMode={uiMode}
              setUiMode={setUiMode}
              stopBy={stopBy}
              setStopBy={setStopBy}
              count={count}
              setCount={setCount}
              durationMs={durationMs}
              setDurationMs={setDurationMs}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
            {/* The per-mode explainer opens from the info icon on THIS page, so
                it lives here — the active pushed screen. The drill surface
                behind is detached while the setup is up, so a Modal rendered
                there wouldn't paint. */}
            <ModeInfoModal
              visible={modeInfoOpen}
              onDismiss={() => setModeInfoOpen(false)}
              modes={MODES.map((m) => ({
                label: m.label,
                description: MODE_DESC[m.key],
              }))}
            />
          </>
        )}
      </DrillNav.Screen>
    </DrillNav.Navigator>
  );
};

const styles = StyleSheet.create({
  panel: {
    // The shared top offset now lives on ScreenWrapper (one place, uniform
    // across tabs), so all three Drill surfaces share it and none jumps the
    // court. paddingBottom is applied inline (tab-bar clearance) so the scrolled
    // column clears the floating bar.
    alignItems: "center",
    gap: PANEL_GAP,
    alignSelf: "stretch",
    paddingHorizontal: 24,
  },
  // The status line, shown only while running/done. Fixed height so a one-line
  // (done) and a two-line (running) status don't nudge the config below them.
  statusSlot: {
    height: TEXT_SLOT_H,
    justifyContent: "center",
  },
  slotText: {
    lineHeight: 20,
  },
  errorLine: {
    alignSelf: "stretch",
  },
  // The gear + Start/Stop row: a compact outline gear beside the full-width
  // primary action, a gap between them, both with the normal rounded corners.
  // The block ALWAYS stretches (running included) so Stop fills the row instead
  // of collapsing to a sliver next to the gear.
  actionBlock: {
    alignSelf: "stretch",
  },
  // Idle adds the vertical rhythm: pull up so the court→Start gap lands on
  // ACTION_GAP (cancelling the court's empty bottom strip + the panel gap), and
  // leave ACTION_GAP below Start to the config band (panel gap + this margin).
  actionBlockIdle: {
    marginTop: ACTION_GAP - COURT_BOTTOM_STRIP - PANEL_GAP,
    marginBottom: ACTION_GAP - PANEL_GAP,
  },
  // alignItems stretch so the gear matches the FULL row height set by Start;
  // only Start's width flexes. The gear is a square (aspectRatio 1), so as Start
  // grows/shrinks the gear tracks its height and stays square.
  actionRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  // Start's two-line content: the label with its muted mode caption beneath,
  // a tight line gap so the two read as one stacked label.
  startContent: {
    alignItems: "center",
  },
  startSummary: {
    marginTop: 1,
  },
  // The gear: an outline square — white fill, thick accent border — that fills
  // the row's height (alignItems stretch) and stays square via aspectRatio, so
  // only the Start button's width adjusts beside it.
  settingsButton: {
    backgroundColor: colors.background,
    borderColor: colors.accent,
    borderWidth: 2,
    aspectRatio: 1,
  },
  // Start / Stop fills the rest of the row's width; a trimmed vertical pad keeps
  // the two-line Start compact.
  actionButton: {
    flex: 1,
    paddingVertical: 7,
  },
  dimmed: {
    opacity: 0.4,
  },
  config: {
    alignSelf: "stretch",
    gap: 8,
  },
  heading: {
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  stats: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 8,
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
  pathActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
});
