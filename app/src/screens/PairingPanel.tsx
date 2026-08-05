import WheelPicker from "@quidone/react-native-wheel-picker";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PairingProgress } from "../ble/contract";
import type { CentralTransport } from "../ble/transport";
import { ConfirmDialog } from "./ConfirmDialog";
import { CourtMap, SPOT_NAMES, type SpotVisual } from "./CourtMap";

/** Wheel choices for "how many targets". */
const WHEEL_DATA = Array.from({ length: 8 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const WHEEL_ITEM_H = 36;
const WHEEL_VISIBLE = 3;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_W = 48; // barely wider than the pill — single digits need no more
const WHEEL_PAD_V = 6; // matches the button's small vertical padding
const PILL_H = 28;

// Fixed footprints for the court-centre info block, so phase changes never
// shift the layout: the tallest status text is 3 lines, the error is 1 line,
// and every action row is one button tall (empty slot when Undo is hidden).
const TEXT_SLOT_H = 60; // 3 lines at lineHeight 20
const ERROR_SLOT_H = 18;
const BUTTON_H = 48; // fingertip-sized; explicit so hidden slots match exactly

/**
 * Pairing round UI (display-ui.md screen 2, phone side). The count wheel only
 * sets HOW MANY targets get bound; WHERE each one stands is chosen during the
 * round — the operator taps a court spot on the map, the central unit lights
 * that same spot on the LED panel, and a two-tap confirm on the physical
 * target binds it. Spots are free-form (e.g. 3 targets all on the left side).
 * Status text and the action button live in the centre of the court, so the
 * operator's eyes stay on the map instead of jumping around the layout.
 * No pairing state is owned here — the central unit drives the round; this
 * only mirrors its Status events.
 */
export function PairingPanel({ transport }: { transport: CentralTransport }) {
  const [total, setTotal] = useState(8);
  const [wheelOpen, setWheelOpen] = useState(false);
  // A new count picked AFTER a completed round — held until the operator
  // confirms discarding the finished pairing.
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [progress, setProgress] = useState<PairingProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link loss is deliberately NOT handled here: App only mounts this panel
  // while connected, so on a drop the whole panel unmounts in the same commit
  // and App's status row shows the reason — a local handler could never paint.
  useEffect(() => {
    const unsub = transport.onStatus((e) => {
      if (e.kind === "pairing") {
        setProgress(e.progress);
        if (e.progress.done) setRunning(false);
      }
    });
    return unsub;
  }, [transport]);

  const done = progress !== null && progress.done;

  // onValueChanged fires only when the scroll SETTLES (the lib emits
  // onValueChanging for intermediate passes) — so a fling 8→4 lands on 4,
  // not on the first value crossed.
  const onWheelValue = (value: number) => {
    if (value === total) return; // settling on the unchanged value keeps it open
    setWheelOpen(false);
    if (done) {
      // A completed map is at stake — confirm before discarding it.
      setPendingTotal(value);
      return;
    }
    setTotal(value);
  };

  // Confirmed: apply the new count and drop back to idle — the operator
  // starts the fresh round themselves.
  const confirmCountChange = () => {
    if (pendingTotal !== null) setTotal(pendingTotal);
    setPendingTotal(null);
    setProgress(null);
    setError(null);
  };

  // Growing a completed map doesn't have to reset it: ExtendPairing keeps the
  // bound targets and resumes the round for the extra ones.
  const extendRound = () => {
    if (pendingTotal === null) return;
    const target = pendingTotal;
    setPendingTotal(null);
    setError(null);
    setTotal(target);
    setRunning(true);
    transport.extendPairing(target).catch((err: unknown) => {
      setRunning(false);
      setError(err instanceof Error ? err.message : "extend failed");
    });
  };

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

  // Correction path: unbind the most recent target and reopen its pick. From
  // a completed round this resumes it, so the map/flow states keep flowing
  // from the central's events — the panel owns nothing.
  const undo = () => {
    setError(null);
    setRunning(true);
    transport.undoPairing().catch((err: unknown) => {
      setRunning(false);
      setError(err instanceof Error ? err.message : "undo failed");
    });
  };

  // Escape hatch for a round that never progresses (a real BLE write can be
  // acked while Status notifications never arrive) — never trap the operator.
  const cancel = () => {
    setRunning(false);
    setProgress(null);
    transport.stopSession().catch(() => {});
  };

  // Round phases: "choosing" — waiting for the operator's map tap;
  // "prompting" — a spot is lit, waiting for the physical target's taps.
  const choosing = running && progress !== null && !done && progress.currentSpot === null;
  const prompting = running && progress !== null && !done && progress.currentSpot !== null;
  const confirming = pendingTotal !== null;

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
    // Idle spots stay dim for the WHOLE round (not just the choosing phase):
    // dipping them to "off" while a prompt is up made every bind read as a
    // double blink and dropped the spatial context mid-prompt.
    return running && !done ? "available" : "off";
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
            disabled={running || confirming}
            onPress={() => setWheelOpen((v) => !v)}
            style={[styles.pill, wheelOpen && styles.pillActive]}
          >
            <Text style={[styles.pillLabel, wheelOpen && styles.pillLabelActive]}>
              {total}
            </Text>
          </Pressable>
          {wheelOpen && !running && (
            <>
              {/* Oversized invisible backdrop: any tap outside the dropdown
                  dismisses it, even when the settled value didn't change. */}
              <Pressable
                testID="wheel-backdrop"
                accessibilityLabel="Close count picker"
                style={styles.wheelBackdrop}
                onPress={() => setWheelOpen(false)}
              />
              <View testID="count-wheel" style={styles.wheelDropdown}>
                <WheelPicker
                  data={WHEEL_DATA}
                  value={total}
                  onValueChanged={({ item }) => onWheelValue(item.value)}
                  itemHeight={WHEEL_ITEM_H}
                  visibleItemCount={WHEEL_VISIBLE}
                  width={WHEEL_W}
                  itemTextStyle={styles.wheelText}
                  overlayItemStyle={styles.wheelOverlay}
                />
              </View>
            </>
          )}
        </View>
      </View>

      <CourtMap spots={visuals} onPressSpot={choosing ? pickSpot : undefined}>
        {confirming ? (
          pendingTotal! > (progress?.total ?? 0) ? (
            // Growing keeps every bound target — no destructive reset needed.
            <ConfirmDialog
              testID="count-extend"
              title={`Add ${pendingTotal! - (progress?.total ?? 0)} more ${
                pendingTotal! - (progress?.total ?? 0) === 1
                  ? "target"
                  : "targets"
              }?`}
              body={`The ${progress?.total} paired ${
                progress?.total === 1 ? "target stays" : "targets stay"
              }`}
              actions={[
                { label: "No", onPress: () => setPendingTotal(null) },
                { label: "Add", onPress: extendRound },
              ]}
            />
          ) : (
            <ConfirmDialog
              testID="count-confirm"
              title={`Change target count to ${pendingTotal}?`}
              body="This resets the pairing"
              actions={[
                { label: "No", onPress: () => setPendingTotal(null) },
                { label: "Yes", danger: true, onPress: confirmCountChange },
              ]}
            />
          )
        ) : (
          <>
            {/* Every slot below has a FIXED footprint — the text area, the
                error line, and both button rows keep their size across all
                round phases, so nothing shifts as states change. */}
            <View testID="status-slot" style={styles.textSlot}>
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
            </View>

            <View testID="error-slot" style={styles.errorSlot}>
              {error !== null && (
                <Text style={styles.error} numberOfLines={1}>
                  {error}
                </Text>
              )}
            </View>

            {/* Actions stack vertically — primary on top, Undo always at the
                very bottom — so the block reads top-to-bottom in one place. */}
            <View style={styles.actionCol}>
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
                  <Text style={styles.buttonLabel}>
                    {done ? "Re-pair" : "Start pairing"}
                  </Text>
                </Pressable>
              )}
              {/* Undo is only offered between binds (choosing) or after done —
                  never mid-prompt, matching the central's refusal. The slot
                  keeps the row's height when the button is hidden. */}
              <View testID="undo-slot" style={styles.undoSlot}>
                {(choosing || done) && boundCount > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Undo last bind"
                    onPress={undo}
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.buttonLabel}>Undo</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </>
        )}
      </CourtMap>
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
  actionCol: {
    alignItems: "stretch",
    alignSelf: "stretch",
    gap: 10,
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
  wheelBackdrop: {
    // Far-oversized invisible catcher — the panel doesn't clip, so this covers
    // the whole screen and closes the wheel on any outside tap.
    position: "absolute",
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
  },
  wheelDropdown: {
    // Centered on the pill so the selected wheel item lands where the pill is
    // (offset accounts for the vertical padding + border).
    position: "absolute",
    top: -((WHEEL_H - PILL_H) / 2 + WHEEL_PAD_V + 1),
    left: "50%",
    marginLeft: -(WHEEL_W / 2 + 1), // half width + border
    paddingVertical: WHEEL_PAD_V,
    // Button-matched chrome: black fill, same border and full rounding, with a
    // soft white glow so the digits separate from the dark background.
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 999,
    overflow: "hidden",
    elevation: 8, // Android stacking
    shadowColor: "#fff",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  wheelText: {
    color: "#fafafa",
    fontSize: 18,
  },
  wheelOverlay: {
    backgroundColor: "#27272a",
    borderRadius: 8,
  },
  // Fixed-height slots: their size never depends on which child (if any) is
  // rendered, so the info block can't jump between phases.
  textSlot: {
    alignSelf: "stretch",
    height: TEXT_SLOT_H,
    alignItems: "center",
    justifyContent: "center",
  },
  errorSlot: {
    height: ERROR_SLOT_H,
    marginBottom: 8,
    justifyContent: "center",
  },
  undoSlot: {
    height: BUTTON_H,
    alignSelf: "stretch",
  },
  prompt: {
    color: "#fafafa",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  hint: {
    color: "#71717a",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  doneText: {
    color: "#34d399",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    height: BUTTON_H,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    backgroundColor: "#18181b",
  },
  buttonLabel: {
    color: "#fafafa",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
