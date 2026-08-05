import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CentralTransport, DrillConfig } from "../ble/transport";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "./CourtMap";
import type { DrillSettings } from "./SettingsPanel";
import { Stepper } from "./Stepper";

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
export function DrillPanel({
  transport,
  pairedSpots,
  settings,
}: {
  transport: CentralTransport;
  pairedSpots: number[]; // canonical spots in bind order (slot order)
  settings: DrillSettings;
}) {
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
    if (uiMode === "path" && path.includes(i)) return "active";
    return "available";
  });

  if (!paired) {
    return (
      <View style={styles.panel}>
        <Text style={styles.hint}>Pair your targets first — drills run on the paired layout</Text>
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
            <Text
              style={[styles.modeLabel, uiMode === m.key && styles.modeLabelActive]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {uiMode === "random" && (
        <>
          <View style={styles.stopRow}>
            <Text style={styles.paramLabel}>Stop after</Text>
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
                  <Text
                    style={[
                      styles.modeLabel,
                      stopBy === s.key && styles.modeLabelActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {stopBy === "count" ? (
            <Stepper
              label="Targets to hit"
              value={count}
              display={String(count)}
              min={1}
              max={99}
              step={1}
              onChange={edit(setCount)}
            />
          ) : (
            <Stepper
              label="Duration"
              value={durationMs}
              display={`${durationMs / 1000} s`}
              min={15000}
              max={300000}
              step={15000}
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
              <Text style={styles.pathText} testID="path-sequence">
                {path.map((s) => SPOT_NAMES[s]).join(" → ")}
              </Text>
              <View style={styles.pathActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => edit(setPath)(path.slice(0, -1))}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.buttonLabel}>Undo</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => edit(setPath)([])}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.buttonLabel}>Clear</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.hint}>Tap paired spots in the order to run</Text>
          )}
        </>
      )}

      {uiMode === "live" && (
        <Text style={styles.hint}>You pick each next target during the session</Text>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {loaded ? (
        <Text style={styles.doneText}>Drill loaded — ready to start</Text>
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
          <Text style={styles.buttonLabel}>Load drill</Text>
        </Pressable>
      )}
    </View>
  );
}

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
    borderColor: "#3f3f46",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeChipActive: {
    borderColor: "#818cf8",
    backgroundColor: "#1e1b4b",
  },
  modeLabel: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
  },
  modeLabelActive: {
    color: "#e0e7ff",
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
    borderColor: "#3f3f46",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  paramLabel: {
    color: "#a1a1aa",
    fontSize: 14,
    flexShrink: 1,
  },
  pathText: {
    color: "#e0e7ff",
    fontSize: 13,
    textAlign: "center",
  },
  pathActions: {
    flexDirection: "row",
    gap: 8,
  },
  smallButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  hint: {
    color: "#71717a",
    fontSize: 13,
    textAlign: "center",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
  },
  doneText: {
    color: "#34d399",
    fontSize: 15,
    fontWeight: "600",
  },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    backgroundColor: "#18181b",
  },
  buttonLabel: {
    color: "#fafafa",
    fontSize: 15,
    fontWeight: "600",
  },
});
