import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PairingProgress } from "../../ble/contract";
import type { CentralTransport } from "../../ble/transport";
import { SPOT_NAMES } from "../../domain/spot";
import { type SpotVisual } from "../../helpers/court";
import { colors } from "../../theme";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { ConfirmModal } from "../ConfirmModal";
import { CourtMap } from "../CourtMap";
import { UndoIcon } from "../Icons";

/** Every layout can bind up to this many targets; a round opens at the max and
 *  Finish trims it to however many the operator actually placed. */
const MAX_TARGETS = 8;

// Fixed footprints for the court-centre info block, so phase changes never
// shift the layout: the tallest status text is 3 lines, the error is 1 line,
// and the action rows keep their size across every round phase.
const TEXT_SLOT_H = 60; // 3 lines at lineHeight 20
const ERROR_SLOT_H = 18;

/**
 * Pairing round UI (display-ui.md screen 2, phone side). There is no count to
 * pick: a round opens at the max and the operator places targets one at a time
 * by tapping a court spot — the central unit lights that same spot on the LED
 * panel, and a two-tap confirm on the physical target binds it. Unbound spots
 * breathe (pulse) to invite the next tap. The operator stops when done: binding
 * all 8 completes the round automatically; Finish ends it early at whatever is
 * bound so far. No pairing state is owned here — the central drives the round;
 * this only mirrors its Status events.
 */
export const PairingPanel = ({
  transport,
  rotation,
  onRotate,
}: {
  transport: CentralTransport;
  /** Court view orientation + its rotate control, threaded to the map (see CourtMap). */
  rotation?: number;
  onRotate?: () => void;
}) => {
  const [progress, setProgress] = useState<PairingProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Destructive actions confirm first — Cancel discards the whole round, Finish
  // ends it with some spots still unpaired.
  const [cancelAsk, setCancelAsk] = useState(false);
  const [finishAsk, setFinishAsk] = useState(false);

  // Link loss is deliberately NOT handled here: MainScreen only mounts this
  // panel while connected, so on a drop the whole panel unmounts in the same
  // commit — a local handler could never paint.
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

  const start = () => {
    setError(null);
    setProgress(null);
    setRunning(true);
    transport.startPairing(MAX_TARGETS).catch((err: unknown) => {
      setRunning(false);
      setError(err instanceof Error ? err.message : "pairing failed");
    });
  };

  // DEV/TEST shortcut — open a round and bind every target at once, skipping the
  // per-spot tapping. Wired only when the transport exposes the helper (the mock
  // does; real BLE won't), so the affordance disappears with the real link.
  const devComplete = () => {
    if (!transport.completePairingNow) return;
    setError(null);
    setProgress(null);
    setRunning(true);
    transport
      .startPairing(MAX_TARGETS)
      .then(() => transport.completePairingNow!())
      .catch((err: unknown) => {
        setRunning(false);
        setError(err instanceof Error ? err.message : "pairing failed");
      });
  };

  // Stop the round early at the current bound count, keeping every bind.
  const finish = () => {
    setFinishAsk(false);
    setError(null);
    transport.finishPairing().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "finish failed");
    });
  };

  // Abort the whole round — nothing is kept.
  const cancel = () => {
    setCancelAsk(false);
    setRunning(false);
    setProgress(null);
    transport.stopSession().catch(() => {});
  };

  // Correction path: unbind the most recent target and reopen its pick.
  const undo = () => {
    setError(null);
    setRunning(true);
    transport.undoPairing().catch((err: unknown) => {
      setRunning(false);
      setError(err instanceof Error ? err.message : "undo failed");
    });
  };

  // Round phases: "choosing" — waiting for the operator's map tap; "prompting"
  // — a spot is lit, waiting for the physical target's taps.
  const choosing =
    running && progress !== null && !done && progress.currentSpot === null;
  const prompting =
    running && progress !== null && !done && progress.currentSpot !== null;

  const pickSpot = (i: number) => {
    if (!choosing || progress === null || progress.boundSpots.includes(i))
      return;
    transport.selectPairingSpot(i).catch(() => {}); // a stale tap is a no-op
  };

  const visuals: SpotVisual[] = Array.from({ length: 8 }, (_, i) => {
    if (progress === null) return "off";
    if (progress.boundSpots.includes(i)) return "bound";
    if (progress.currentSpot === i) {
      return progress.awaitingConfirm ? "confirm" : "active";
    }
    // Unbound spots breathe to invite the next tap — but ONLY while choosing
    // (no spot prompted). Once a target is being placed the rest go static so
    // the eye stays on the one prompt; they resume pulsing the moment it binds
    // (the check appears) and the round is choosing again. Off once done.
    if (!running || done) return "off";
    return progress.currentSpot === null ? "pulse" : "available";
  });

  const boundCount = progress?.boundSpots.length ?? 0;
  // Undo and Finish are only offered between binds (never mid-prompt, matching
  // the central's refusal) and once at least one target is bound.
  const canCorrect = choosing && boundCount > 0;

  return (
    <View style={styles.panel}>
      <CourtMap
        spots={visuals}
        onPressSpot={choosing ? pickSpot : undefined}
        rotation={rotation}
        onRotate={onRotate}
      >
        <>
          {/* Every slot has a FIXED footprint — the text area, the error line,
              and the action rows keep their size across all round phases, so
              nothing shifts as states change. */}
          <View testID="status-slot" style={styles.textSlot}>
            {choosing ? (
              <AppText center size={16} weight="600" style={styles.slotText}>
                Tap the map to place target {boundCount + 1}
              </AppText>
            ) : prompting ? (
              <AppText center size={16} weight="600" style={styles.slotText}>
                {progress.awaitingConfirm
                  ? "Press again to confirm"
                  : `Press the ${SPOT_NAMES[progress.currentSpot!]} target`}
              </AppText>
            ) : running ? (
              <AppText center size={16} weight="600" style={styles.slotText}>
                Starting pairing…
              </AppText>
            ) : done ? (
              <AppText
                center
                size={15}
                weight="600"
                color={colors.success}
                style={styles.slotText}
              >
                Paired {progress.total}{" "}
                {progress.total === 1 ? "target" : "targets"}
              </AppText>
            ) : (
              <AppText
                center
                size={13}
                color={colors.textMuted}
                style={styles.slotText}
              >
                Tap Start, then place each target on the court
              </AppText>
            )}
          </View>

          <View testID="error-slot" style={styles.errorSlot}>
            {error !== null && (
              <AppText center size={13} numberOfLines={1} color={colors.danger}>
                {error}
              </AppText>
            )}
          </View>

          <View style={styles.actionCol}>
            {running ? (
              <>
                {/* Cancel (destructive, red outline) sits left; Undo is a
                    compact icon to its right, on the same row. Both Undo and
                    Finish are shown from the start of the round and only enable
                    once there is a bind to act on (and never mid-prompt). */}
                <View style={styles.controlRow}>
                  <Button
                    testID="cancel-pairing"
                    label="Cancel"
                    danger
                    onPress={() => setCancelAsk(true)}
                    style={styles.cancelButton}
                  />
                  <Button
                    testID="undo-pairing"
                    accessibilityLabel="Undo last bind"
                    size="icon"
                    disabled={!canCorrect}
                    onPress={undo}
                  >
                    <UndoIcon />
                  </Button>
                </View>
                <Button
                  testID="finish-pairing"
                  label="Finish"
                  disabled={!canCorrect}
                  onPress={() => setFinishAsk(true)}
                />
              </>
            ) : done ? null : (
              <>
                <Button
                  testID="start-pairing"
                  label="Start"
                  onPress={start}
                />
                {/* DEV-only: bind everything at once so testing needn't tap each
                    spot. Present only with the mock transport. */}
                {transport.completePairingNow && (
                  <Button
                    testID="dev-complete-pairing"
                    label="Complete (dev)"
                    dashed
                    textColor={colors.textMuted}
                    textSize={13}
                    onPress={devComplete}
                  />
                )}
              </>
            )}
          </View>
        </>
      </CourtMap>

      {/* Confirms — shown centered on screen like every confirm. */}
      <ConfirmModal
        visible={cancelAsk}
        onDismiss={() => setCancelAsk(false)}
        testID="cancel-confirm"
        title="Cancel pairing?"
        body="This discards the round and every target bound so far."
        actions={[
          { label: "Keep going", onPress: () => setCancelAsk(false) },
          { label: "Cancel", danger: true, onPress: cancel },
        ]}
      />
      <ConfirmModal
        visible={finishAsk}
        onDismiss={() => setFinishAsk(false)}
        testID="finish-confirm"
        title={`Finish with ${boundCount} of ${MAX_TARGETS} targets?`}
        body="The remaining spots stay unpaired — you can re-pair later."
        actions={[
          { label: "Keep going", onPress: () => setFinishAsk(false) },
          { label: "Finish", onPress: finish },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    marginTop: 32,
    alignItems: "center",
    gap: 12,
  },
  actionCol: {
    alignItems: "stretch",
    alignSelf: "stretch",
    gap: 10,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  // Shared by every status-slot text: the fixed slot height assumes this
  // lineHeight regardless of which text (and size) is showing.
  slotText: {
    lineHeight: 20,
  },
  // Cancel fills the row beside the fixed-width undo icon; the red outline is
  // the Button `danger` prop.
  cancelButton: {
    flex: 1,
  },
});
