import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PairingProgress } from "../ble/contract";
import type { CentralTransport } from "../ble/transport";

/** Active-layout sizes the operator can pick — any count up to MAX_TARGETS. */
const LAYOUT_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Pairing round UI (display-ui.md screen 2, phone side). A renderer over the
 * transport's `pairing` events: the operator picks how many targets are in
 * play, starts the round, and the panel tracks "press slot X of N" until the
 * round reports done (currentPrompt = -1). No pairing state is owned here —
 * the central unit drives the round; this only mirrors its progress.
 */
export function PairingPanel({ transport }: { transport: CentralTransport }) {
  const [total, setTotal] = useState<number>(8);
  const [progress, setProgress] = useState<PairingProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "pairing") {
        setProgress(e.progress);
        if (e.progress.currentPrompt < 0) setRunning(false);
      }
    });
    return unsub;
  }, [transport]);

  const start = () => {
    setError(null);
    setProgress(null);
    setRunning(true);
    transport.startPairing(total).catch((err: unknown) => {
      setRunning(false);
      setError(err instanceof Error ? err.message : "pairing failed");
    });
  };

  const done = !running && progress !== null && progress.currentPrompt < 0;
  const prompting = running && progress !== null && progress.currentPrompt >= 0;

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Targets</Text>

      {!running && (
        <View style={styles.countRow}>
          {LAYOUT_SIZES.map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected: total === n }}
              onPress={() => setTotal(n)}
              style={[styles.chip, total === n && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, total === n && styles.chipLabelActive]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {prompting ? (
        <>
          <Text style={styles.prompt}>
            Press slot {progress.currentPrompt + 1} of {progress.total}
          </Text>
          <View style={styles.slotRow}>
            {Array.from({ length: progress.total }, (_, i) => (
              <View
                key={i}
                testID={
                  i === progress.currentPrompt
                    ? "slot-active"
                    : i < progress.currentPrompt
                      ? "slot-bound"
                      : "slot-idle"
                }
                style={[
                  styles.slot,
                  i < progress.currentPrompt && styles.slotBound,
                  i === progress.currentPrompt && styles.slotActive,
                ]}
              />
            ))}
          </View>
        </>
      ) : running ? (
        <Text style={styles.prompt}>Starting pairing…</Text>
      ) : done ? (
        <Text style={styles.doneText}>
          Paired {progress.total} {progress.total === 1 ? "target" : "targets"}
        </Text>
      ) : null}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {!running && (
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
  heading: {
    color: "#a1a1aa",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  countRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 36,
    alignItems: "center",
  },
  chipActive: {
    borderColor: "#818cf8",
    backgroundColor: "#1e1b4b",
  },
  chipLabel: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
  },
  chipLabelActive: {
    color: "#e0e7ff",
  },
  prompt: {
    color: "#fafafa",
    fontSize: 16,
    fontWeight: "600",
  },
  slotRow: {
    flexDirection: "row",
    gap: 8,
  },
  slot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#27272a",
  },
  slotBound: {
    backgroundColor: "#52525b",
  },
  slotActive: {
    backgroundColor: "#818cf8",
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
