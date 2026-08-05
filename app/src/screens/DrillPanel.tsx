import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { CentralTransport, DrillConfig } from "../ble/transport";
import { AppText } from "../components/AppText";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "../components/CourtMap";
import { msOptions, WheelField } from "../components/WheelField";
import { colors } from "../theme";
import type { DrillSettings } from "./SettingsPanel";

const COUNT_OPTIONS = Array.from({ length: 99 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));
const DURATION_OPTIONS = msOptions(15000, 300000, 15000);

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
 * Drill builder (phone side of "Control: config"). The operator picks a mode
 * and its params, authors a Path sequence by tapping paired spots on the court
 * map, and loads the config to the central unit (ControlOp.LoadDrill).
 * Delay/timeout/repeat live on the settings screen (App header) and arrive via
 * `settings`; which of them go on the wire still depends on the resolved
 * engine mode (drill_engine.h): delay never applies to Live, repeat only
 * shapes the random pickers, timeout applies everywhere.
 *
 * Drills operate on POSITIONS (slot indices from the pairing round), not
 * canonical spots: `pairedSpots[i]` is the court spot bound to slot i, so a
 * map tap on spot s translates to position pairedSpots.indexOf(s). The wire
 * config therefore matches the firmware DrillConfig unchanged.
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
  const [durationMs, setDurationMs] = useState(60000);
  const [path, setPath] = useState<number[]>([]); // canonical spots, in order
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paired = pairedSpots.length > 0;

  // A re-pair can drop spots the authored path referenced — without this, a
  // stale path would translate to position -1 (255 on the wire) and arm a
  // target that doesn't exist. Filter out vanished spots and invalidate a
  // previously loaded config so the operator re-checks what remains.
  useEffect(() => {
    setPath((prev) => {
      const kept = prev.filter((s) => pairedSpots.includes(s));
      if (kept.length === prev.length) return prev; // idempotent on fresh arrays
      setLoaded(false);
      return kept;
    });
  }, [pairedSpots]);

  // Settings edits happen on their own screen — a loaded config no longer
  // matches what would be sent, so it must fall back to "Load drill".
  useEffect(() => {
    setLoaded(false);
  }, [settings]);

  // Any edit invalidates a previously loaded config.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    setLoaded(false);
    setError(null);
    set(v);
  };
  const pickMode = edit(setUiMode);

  const appendPathSpot = (spot: number) => {
    if (uiMode !== "path" || !pairedSpots.includes(spot)) return;
    edit(setPath)([...path, spot]);
  };

  // The engine mode this UI state resolves to on the wire.
  const wireMode: DrillConfig["mode"] =
    uiMode === "random" ? (stopBy === "time" ? "time" : "random") : uiMode;

  const load = () => {
    // Only the params the resolved mode actually uses go on the wire — the
    // engine would ignore the rest, but stale values must not leak.
    const config: DrillConfig = {
      mode: wireMode,
      numPositions: pairedSpots.length,
      timeoutMs: settings.timeoutMs,
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
    transport.loadDrill(config).then(
      () => setLoaded(true),
      (err: unknown) =>
        setError(err instanceof Error ? err.message : "load failed"),
    );
  };

  const visuals: SpotVisual[] = Array.from({ length: 8 }, (_, i) => {
    if (!pairedSpots.includes(i)) return "off";
    // Path steps are a static pick, not an in-progress prompt — "selected"
    // (accent fill), while "active" now renders the pairing spinner.
    if (uiMode === "path" && path.includes(i)) return "selected";
    return "available";
  });

  if (!paired) {
    return (
      <View style={styles.panel}>
        <AppText size={13} center color={colors.textMuted}>
          Pair your targets first — drills run on the paired layout
        </AppText>
      </View>
    );
  }

  const canLoad = uiMode !== "path" || path.length > 0;

  return (
    <View style={styles.panel}>
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            accessibilityRole="button"
            accessibilityState={{ selected: uiMode === m.key }}
            onPress={() => pickMode(m.key)}
            style={[styles.modeChip, uiMode === m.key && styles.modeChipActive]}
          >
            <AppText
              weight="600"
              color={uiMode === m.key ? colors.accentText : colors.textSecondary}
            >
              {m.label}
            </AppText>
          </Pressable>
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
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stopBy === s.key }}
                  onPress={() => edit(setStopBy)(s.key)}
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
                </Pressable>
              ))}
            </View>
          </View>
          {stopBy === "count" ? (
            <WheelField
              label="Targets to hit"
              testID="drill-count"
              value={count}
              options={COUNT_OPTIONS}
              onChange={edit(setCount)}
            />
          ) : (
            <WheelField
              label="Duration"
              testID="drill-duration"
              value={durationMs}
              options={DURATION_OPTIONS}
              onChange={edit(setDurationMs)}
            />
          )}
        </>
      )}

      {uiMode === "path" && (
        <>
          <CourtMap spots={visuals} onPressSpot={appendPathSpot} />
          {path.length > 0 ? (
            <>
              <AppText
                size={13}
                center
                color={colors.accentText}
                testID="path-sequence"
              >
                {path.map((s) => SPOT_NAMES[s]).join(" → ")}
              </AppText>
              <View style={styles.pathActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => edit(setPath)(path.slice(0, -1))}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.buttonPressed]}
                >
                  <AppText size={15} weight="600">
                    Undo
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => edit(setPath)([])}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.buttonPressed]}
                >
                  <AppText size={15} weight="600">
                    Clear
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <AppText size={13} center color={colors.textMuted}>
              Tap paired spots in the order to run
            </AppText>
          )}
        </>
      )}

      {uiMode === "live" && (
        <AppText size={13} center color={colors.textMuted}>
          You pick each next target during the session
        </AppText>
      )}

      {error !== null && (
        <AppText size={13} color={colors.danger}>
          {error}
        </AppText>
      )}

      {loaded ? (
        <AppText size={15} weight="600" color={colors.success}>
          Drill loaded — ready to start
        </AppText>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={!canLoad}
          onPress={load}
          style={({ pressed }) => [
            styles.button,
            !canLoad && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <AppText size={15} weight="600">
            Load drill
          </AppText>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    marginTop: 24,
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    paddingHorizontal: 24,
  },
  modeRow: {
    flexDirection: "row",
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
    gap: 8,
  },
  smallButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    backgroundColor: colors.surface,
  },
});
