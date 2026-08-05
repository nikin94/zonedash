import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { HitRecord } from "../ble/contract";
import type {
  CentralTransport,
  DrillConfig,
  SessionState,
} from "../ble/transport";
import { AppText } from "../components/AppText";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "../components/CourtMap";
import { CustomPressable } from "../components/CustomPressable";
import { Header } from "../components/Header";
import { msOptions, WheelField } from "../components/WheelField";
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

/**
 * The exercise screen — the app's home. One court map does double duty: while
 * idle it authors the drill (Path steps are tapped right on it), while running
 * it mirrors the central unit's Status events — `progress` arms a spot
 * (spinner), `resolved` flashes it green, and the `done` session state pulls
 * DumpResults for the summary. The drill config lives below the court; Start
 * composes it (mode + count/duration + the Settings-screen params) and sends
 * LoadDrill + StartSession in one go — no separate load step. No timeout goes
 * on the wire, so a run counts hits only — misses don't exist in the app.
 *
 * Drills operate on POSITIONS (slot indices from the pairing round):
 * `pairedSpots[i]` is the court spot bound to slot i, so an authored spot
 * translates to `indexOf` on the way out and `pairedSpots[position]` translates
 * events back onto the map.
 */
export const ExercisePanel = ({
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
  const [durationMs, setDurationMs] = useState(60000);
  const [path, setPath] = useState<number[]>([]); // canonical spots, in order
  const [session, setSession] = useState<SessionState>("idle");
  const [armedSpot, setArmedSpot] = useState<number | null>(null); // canonical
  const [flashSpot, setFlashSpot] = useState<number | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
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
        if (spot != null) {
          setFlashSpot(spot);
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlashSpot(null), FLASH_MS);
        }
      }
      if (e.kind === "session") {
        setSession(e.state);
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

    setError(null);
    setRecords(null);
    setResolvedCount(0);
    setLastReactionMs(null);
    setFlashSpot(null);
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
    if (running && armedSpot === i) return "active";
    // While idle the map is the Path authoring surface.
    if (!running && uiMode === "path" && path.includes(i)) return "selected";
    return "available";
  });

  const canStart = uiMode !== "path" || path.length > 0;
  const avgMs =
    records !== null && records.length > 0
      ? Math.round(records.reduce((s, r) => s + r.reactionMs, 0) / records.length)
      : null;
  const bestMs =
    records !== null && records.length > 0
      ? Math.min(...records.map((r) => r.reactionMs))
      : null;

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <CourtMap
        spots={visuals}
        onPressSpot={!running && uiMode === "path" ? appendPathSpot : undefined}
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
                color={lastReactionMs === null ? colors.textMuted : colors.success}
                style={styles.slotText}
              >
                {lastReactionMs === null
                  ? "React when a target lights up"
                  : `${lastReactionMs} ms`}
              </AppText>
            </>
          ) : done && records !== null ? (
            <>
              <AppText center size={16} weight="600" style={styles.slotText}>
                {records.length} {records.length === 1 ? "hit" : "hits"}
              </AppText>
              <AppText
                center
                size={13}
                color={colors.textSecondary}
                style={styles.slotText}
              >
                {avgMs !== null ? `avg ${avgMs} ms · best ${bestMs} ms` : "—"}
              </AppText>
            </>
          ) : done ? (
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
              {done ? "Run again" : "Start"}
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
        <View style={styles.modeRow}>
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

        {uiMode === "random" && (
          <>
            <View style={styles.stopRow}>
              <AppText color={colors.textSecondary} style={styles.paramLabel}>
                Stop after
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

        {uiMode === "live" && (
          <AppText center size={13} color={colors.textMuted}>
            The coach picks targets on the fly — nothing to configure
          </AppText>
        )}
      </View>
    </ScrollView>
  );
};

/** The app's home screen: Header + the exercise panel, gated on the link and
 *  the paired layout (a drill runs on the layout the pairing round bound). */
export const ExerciseScreen = () => {
  const { transport, connection, connectionError, pairedSpots, settings } =
    useAppState();
  const connected = connection === "connected";
  const busy = connection === "connecting";

  return (
    <View style={styles.screen}>
      <Header />
      {connected && pairedSpots.length > 0 ? (
        <ExercisePanel
          transport={transport}
          pairedSpots={pairedSpots}
          settings={settings}
        />
      ) : (
        <AppText center size={13} color={colors.textMuted} style={styles.screenHint}>
          {!connected
            ? busy
              ? "Connecting to the central unit…"
              : connection === "error"
                ? `${connectionError ?? "Connection failed"} — tap the status in the header to retry`
                : "Not connected — tap the status in the header to connect"
            : "Pair your targets first — open Pairing from the central unit menu"}
        </AppText>
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
  screenHint: {
    marginTop: 48,
    paddingHorizontal: 32,
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
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
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
