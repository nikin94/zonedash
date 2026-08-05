import WheelPicker from "@quidone/react-native-wheel-picker";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PairingProgress } from "../ble/contract";
import type { CentralTransport } from "../ble/transport";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "./CourtMap";

/** Wheel choices for the quick "how many targets" pick. */
const WHEEL_DATA = Array.from({ length: 8 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

/** Which canonical spots a count pick activates, in priority order: the four
 *  corners first (footwork priority), then net/back centres (6 = the v0
 *  layout), mid-sides last. Tapping the map overrides any preset. */
const COUNT_PRESETS = [0, 2, 4, 6, 1, 5, 7, 3];
const spotsForCount = (n: number) =>
  COUNT_PRESETS.slice(0, n).sort((a, b) => a - b);

/**
 * Pairing round UI (display-ui.md screen 2, phone side). The court map is the
 * selector: the operator taps the spots where targets physically stand (or
 * spins the count wheel for a quick preset), starts the round, and both this
 * map and the HUB75 panel light the same canonical spot until every one is
 * bound. No pairing state is owned here — the central unit drives the round;
 * this only mirrors its Status events.
 */
export function PairingPanel({ transport }: { transport: CentralTransport }) {
  const [selected, setSelected] = useState<number[]>(spotsForCount(8));
  const [wheelOpen, setWheelOpen] = useState(false);
  // The spot set the running round was started with — maps the transport's
  // round index (currentPrompt) back to a canonical spot.
  const [roundSpots, setRoundSpots] = useState<number[]>([]);
  const [progress, setProgress] = useState<PairingProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "pairing") {
        setProgress(e.progress);
        if (e.progress.currentPrompt < 0) setRunning(false);
      }
      // A lost/failed link mid-round must end with a message, not a silent
      // vanish — real BLE drops routinely.
      if (e.kind === "connection" && e.state !== "connected") {
        setRunning((was) => {
          if (was) setError(e.reason ?? "connection lost");
          return false;
        });
      }
    });
    return unsub;
  }, [transport]);

  const toggleSpot = (i: number) => {
    if (running) return;
    setProgress(null); // stale "Paired N" must not outlive a layout change
    setSelected((prev) => {
      if (prev.includes(i)) {
        return prev.length > 1 ? prev.filter((s) => s !== i) : prev; // keep ≥1
      }
      return [...prev, i].sort((a, b) => a - b);
    });
  };

  const pickCount = (n: number) => {
    setProgress(null);
    setSelected(spotsForCount(n));
  };

  const start = () => {
    setError(null);
    setProgress(null);
    setWheelOpen(false);
    setRoundSpots(selected);
    setRunning(true);
    transport.startPairing(selected).catch((err: unknown) => {
      setRunning(false);
      setError(err instanceof Error ? err.message : "pairing failed");
    });
  };

  // Escape hatch for a round that never progresses (a real BLE write can be
  // acked while Status notifications never arrive) — never trap the operator.
  const cancel = () => {
    setRunning(false);
    setProgress(null);
    transport.stopSession().catch(() => {});
  };

  const done = !running && progress !== null && progress.currentPrompt < 0;
  const prompting = running && progress !== null && progress.currentPrompt >= 0;
  const activeSpot = prompting ? roundSpots[progress.currentPrompt] : -1;

  const visuals: SpotVisual[] = Array.from({ length: 8 }, (_, i) => {
    if (prompting) {
      const idx = roundSpots.indexOf(i);
      if (idx < 0) return "off";
      if (idx < progress.currentPrompt) return "bound";
      if (idx === progress.currentPrompt) {
        return progress.awaitingConfirm ? "confirm" : "active";
      }
      return "pending";
    }
    if (done) return roundSpots.includes(i) ? "bound" : "off";
    return selected.includes(i) ? "selected" : "off";
  });

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Targets</Text>
        <Pressable
          testID="count-pill"
          accessibilityRole="button"
          accessibilityLabel={`${selected.length} targets, tap to change`}
          disabled={running}
          onPress={() => setWheelOpen((v) => !v)}
          style={[styles.pill, wheelOpen && styles.pillActive]}
        >
          <Text style={[styles.pillLabel, wheelOpen && styles.pillLabelActive]}>
            {selected.length}
          </Text>
        </Pressable>
      </View>

      {wheelOpen && !running && (
        <View testID="count-wheel">
          <WheelPicker
            data={WHEEL_DATA}
            value={selected.length}
            onValueChanged={({ item }) => pickCount(item.value)}
            itemHeight={36}
            visibleItemCount={3}
            width={96}
            itemTextStyle={styles.wheelText}
            overlayItemStyle={styles.wheelOverlay}
          />
        </View>
      )}

      <CourtMap
        spots={visuals}
        onPressSpot={running ? undefined : toggleSpot}
      />

      {prompting ? (
        <Text style={styles.prompt}>
          {progress.awaitingConfirm
            ? "Press again to confirm"
            : `Press the ${SPOT_NAMES[activeSpot]} target (${
                progress.currentPrompt + 1
              }/${progress.total})`}
        </Text>
      ) : running ? (
        <Text style={styles.prompt}>Starting pairing…</Text>
      ) : done ? (
        <Text style={styles.doneText}>
          Paired {progress.total} {progress.total === 1 ? "target" : "targets"}
        </Text>
      ) : (
        <Text style={styles.hint}>Tap the map where your targets stand</Text>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {running ? (
        <Pressable
          accessibilityRole="button"
          onPress={cancel}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Cancel</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={start}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>{done ? "Re-pair" : "Start pairing"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 32,
    alignItems: "center",
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heading: {
    color: "#a1a1aa",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 36,
    alignItems: "center",
  },
  pillActive: {
    borderColor: "#818cf8",
    backgroundColor: "#1e1b4b",
  },
  pillLabel: {
    color: "#fafafa",
    fontSize: 14,
    fontWeight: "600",
  },
  pillLabelActive: {
    color: "#e0e7ff",
  },
  wheelText: {
    color: "#fafafa",
    fontSize: 18,
  },
  wheelOverlay: {
    backgroundColor: "#27272a",
    borderRadius: 8,
  },
  prompt: {
    color: "#fafafa",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  hint: {
    color: "#71717a",
    fontSize: 13,
  },
  doneText: {
    color: "#34d399",
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
  },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  buttonPressed: {
    backgroundColor: "#18181b",
  },
  buttonLabel: {
    color: "#fafafa",
    fontSize: 14,
    fontWeight: "600",
  },
});
