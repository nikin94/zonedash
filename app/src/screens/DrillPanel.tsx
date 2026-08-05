import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import type { CentralTransport, DrillConfig } from "../ble/transport";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "./CourtMap";

type Mode = DrillConfig["mode"];

const MODES: { key: Mode; label: string }[] = [
  { key: "random", label: "Random" },
  { key: "path", label: "Path" },
  { key: "live", label: "Live" },
  { key: "time", label: "Time" },
];

/** Which params each engine mode actually uses (drill_engine.h): count is
 *  Random-only, duration is Time-only, repeat shapes the random pickers,
 *  delay never applies to Live (advance is operator-driven), timeout applies
 *  everywhere. */
const SHOWS: Record<Mode, { count?: true; duration?: true; delay?: true; repeat?: true }> = {
  random: { count: true, delay: true, repeat: true },
  path: { delay: true },
  live: {},
  time: { duration: true, delay: true, repeat: true },
};

const fmtSeconds = (ms: number) => (ms % 1000 === 0 ? `${ms / 1000}` : (ms / 1000).toFixed(1));

/**
 * Drill builder (phone side of "Control: config"). The operator picks a mode
 * and its params, authors a Path sequence by tapping paired spots on the court
 * map, and loads the config to the central unit (ControlOp.LoadDrill).
 * Starting/running the session is the live-session screen's job — this panel
 * only configures.
 *
 * Drills operate on POSITIONS (slot indices from the pairing round), not
 * canonical spots: `pairedSpots[i]` is the court spot bound to slot i, so a
 * map tap on spot s translates to position pairedSpots.indexOf(s). The wire
 * config therefore matches the firmware DrillConfig unchanged.
 */
export function DrillPanel({
  transport,
  pairedSpots,
}: {
  transport: CentralTransport;
  pairedSpots: number[]; // canonical spots in bind order (slot order)
}) {
  const [mode, setMode] = useState<Mode>("random");
  const [count, setCount] = useState(10);
  const [durationMs, setDurationMs] = useState(60000);
  const [delayMs, setDelayMs] = useState(0);
  const [timeoutMs, setTimeoutMs] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [path, setPath] = useState<number[]>([]); // canonical spots, in order
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paired = pairedSpots.length > 0;

  // Any edit invalidates a previously loaded config.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    setLoaded(false);
    setError(null);
    set(v);
  };
  const pickMode = edit(setMode);

  const appendPathSpot = (spot: number) => {
    if (mode !== "path" || !pairedSpots.includes(spot)) return;
    edit(setPath)([...path, spot]);
  };

  const load = () => {
    const config: DrillConfig = {
      mode,
      numPositions: pairedSpots.length,
      delayMs,
      timeoutMs,
      allowImmediateRepeat: repeat,
    };
    if (mode === "random") config.count = count;
    if (mode === "time") config.durationMs = durationMs;
    // Positions are slot indices — translate the authored canonical spots.
    if (mode === "path") config.path = path.map((s) => pairedSpots.indexOf(s));

    setError(null);
    transport.loadDrill(config).then(
      () => setLoaded(true),
      (err: unknown) =>
        setError(err instanceof Error ? err.message : "load failed"),
    );
  };

  const visuals: SpotVisual[] = Array.from({ length: 8 }, (_, i) => {
    if (!pairedSpots.includes(i)) return "off";
    if (mode === "path" && path.includes(i)) return "active";
    return "available";
  });

  if (!paired) {
    return (
      <View style={styles.panel}>
        <Text style={styles.hint}>Pair your targets first — drills run on the paired layout</Text>
      </View>
    );
  }

  const shows = SHOWS[mode];
  const canLoad = mode !== "path" || path.length > 0;

  return (
    <View style={styles.panel}>
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.key }}
            onPress={() => pickMode(m.key)}
            style={[styles.modeChip, mode === m.key && styles.modeChipActive]}
          >
            <Text
              style={[styles.modeLabel, mode === m.key && styles.modeLabelActive]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === "path" && (
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

      {shows.count && (
        <Stepper
          label="Targets to hit"
          value={count}
          display={String(count)}
          min={1}
          max={99}
          step={1}
          onChange={edit(setCount)}
        />
      )}
      {shows.duration && (
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
      {shows.delay && (
        <Stepper
          label="Delay between targets"
          value={delayMs}
          display={delayMs === 0 ? "none" : `${fmtSeconds(delayMs)} s`}
          min={0}
          max={5000}
          step={500}
          onChange={edit(setDelayMs)}
        />
      )}
      <Stepper
        label="Timeout (auto-miss)"
        value={timeoutMs}
        display={timeoutMs === 0 ? "off" : `${fmtSeconds(timeoutMs)} s`}
        min={0}
        max={10000}
        step={500}
        onChange={edit(setTimeoutMs)}
      />
      {shows.repeat && (
        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Same target twice in a row</Text>
          <Switch
            accessibilityLabel="Allow immediate repeat"
            value={repeat}
            onValueChange={edit(setRepeat)}
          />
        </View>
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

/** Finger-sized −/+ control for a bounded numeric param. */
function Stepper({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.paramRow}>
      <Text style={styles.paramLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={({ pressed }) => [
            styles.stepButton,
            value <= min && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.stepGlyph}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{display}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={({ pressed }) => [
            styles.stepButton,
            value >= max && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.stepGlyph}>+</Text>
        </Pressable>
      </View>
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
  paramRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  paramLabel: {
    color: "#a1a1aa",
    fontSize: 14,
    flexShrink: 1,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "600",
  },
  stepValue: {
    color: "#fafafa",
    fontSize: 15,
    fontWeight: "600",
    minWidth: 64,
    textAlign: "center",
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
