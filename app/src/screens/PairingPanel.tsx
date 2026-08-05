import WheelPicker from "@quidone/react-native-wheel-picker";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PairingProgress } from "../ble/contract";
import type { CentralTransport } from "../ble/transport";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "./CourtMap";

/** Wheel choices for "how many targets". */
const WHEEL_DATA = Array.from({ length: 8 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const WHEEL_ITEM_H = 36;
const WHEEL_VISIBLE = 3;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const PILL_H = 28;

/**
 * Pairing round UI (display-ui.md screen 2, phone side). The count wheel only
 * sets HOW MANY targets get bound; WHERE each one stands is chosen during the
 * round — the operator taps a court spot on the map, the central unit lights
 * that same spot on the LED panel, and a two-tap confirm on the physical
 * target binds it. Spots are free-form (e.g. 3 targets all on the left side).
 * No pairing state is owned here — the central unit drives the round; this
 * only mirrors its Status events.
 */
export function PairingPanel({ transport }: { transport: CentralTransport }) {
  const [total, setTotal] = useState(8);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [progress, setProgress] = useState<PairingProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "pairing") {
        setProgress(e.progress);
        if (e.progress.done) setRunning(false);
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

  const start = () => {
    setError(null);
    setProgress(null);
    setWheelOpen(false);
    setRunning(true);
    transport.startPairing(total).catch((err: unknown) => {
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

  const done = progress !== null && progress.done;
  // Round phases: "choosing" — waiting for the operator's map tap;
  // "prompting" — a spot is lit, waiting for the physical target's taps.
  const choosing = running && progress !== null && !done && progress.currentSpot === null;
  const prompting = running && progress !== null && !done && progress.currentSpot !== null;

  const pickSpot = (i: number) => {
    if (!choosing || progress === null || progress.boundSpots.includes(i)) return;
    transport.selectPairingSpot(i).catch(() => {}); // a stale tap is a no-op
  };

  const visuals: SpotVisual[] = Array.from({ length: 8 }, (_, i) => {
    if (progress === null) return "off";
    if (progress.boundSpots.includes(i)) return "bound";
    if (progress.currentSpot === i) {
      return progress.awaitingConfirm ? "confirm" : "active";
    }
    return choosing ? "available" : "off";
  });

  const boundCount = progress?.boundSpots.length ?? 0;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Targets</Text>
        {/* The wheel drops down as an absolute overlay anchored on the pill, so
            the selected item sits exactly where the pill is. */}
        <View style={styles.pillAnchor}>
          <Pressable
            testID="count-pill"
            accessibilityRole="button"
            accessibilityLabel={`${total} targets, tap to change`}
            disabled={running}
            onPress={() => setWheelOpen((v) => !v)}
            style={[styles.pill, wheelOpen && styles.pillActive]}
          >
            <Text style={[styles.pillLabel, wheelOpen && styles.pillLabelActive]}>
              {total}
            </Text>
          </Pressable>
          {wheelOpen && !running && (
            <View testID="count-wheel" style={styles.wheelDropdown}>
              <WheelPicker
                data={WHEEL_DATA}
                value={total}
                onValueChanged={({ item }) => setTotal(item.value)}
                itemHeight={WHEEL_ITEM_H}
                visibleItemCount={WHEEL_VISIBLE}
                width={72}
                itemTextStyle={styles.wheelText}
                overlayItemStyle={styles.wheelOverlay}
              />
            </View>
          )}
        </View>
      </View>

      <CourtMap spots={visuals} onPressSpot={choosing ? pickSpot : undefined} />

      {choosing ? (
        <Text style={styles.prompt}>
          Tap the map where target {boundCount + 1} of {progress.total} stands
        </Text>
      ) : prompting ? (
        <Text style={styles.prompt}>
          {progress.awaitingConfirm
            ? "Press again to confirm"
            : `Press the ${SPOT_NAMES[progress.currentSpot!]} target (${
                boundCount + 1
              }/${progress.total})`}
        </Text>
      ) : running ? (
        <Text style={styles.prompt}>Starting pairing…</Text>
      ) : done ? (
        <Text style={styles.doneText}>
          Paired {progress.total} {progress.total === 1 ? "target" : "targets"}
        </Text>
      ) : (
        <Text style={styles.hint}>
          Pick a count, then place each target during pairing
        </Text>
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
    zIndex: 10, // the wheel dropdown must overlay the map below
  },
  heading: {
    color: "#a1a1aa",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  pillAnchor: {
    // Anchor for the absolute dropdown; matches the pill's footprint.
    width: 44,
    height: PILL_H,
  },
  pill: {
    height: PILL_H,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
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
  wheelDropdown: {
    // Centered on the pill so the selected wheel item lands where the pill is.
    position: "absolute",
    top: -(WHEEL_H - PILL_H) / 2,
    left: "50%",
    marginLeft: -36, // half the wheel width
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 8, // Android stacking
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
