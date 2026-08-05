import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { HitRecord } from "../ble/contract";
import type { CentralTransport, SessionState } from "../ble/transport";
import { AppText } from "../components/AppText";
import { CourtMap, type SpotVisual } from "../components/CourtMap";
import { CustomPressable } from "../components/CustomPressable";
import { colors } from "../theme";

/** How long a resolved step's green/red flash stays on the map. Shorter than
 *  the engine's default step cadence so the flash clears before the next arm. */
const FLASH_MS = 450;

// Fixed footprints for the court-centre block (same pattern as PairingPanel),
// so idle → running → done never shifts the layout.
const TEXT_SLOT_H = 60; // 3 lines at lineHeight 20
const ERROR_SLOT_H = 18;
const BUTTON_H = 48;

/** The last resolved step, kept for the status line. */
interface LastResolved {
  miss: boolean;
  reactionMs: number;
}

/**
 * Live session screen: Start/Stop for the drill loaded from the Drill tab,
 * rendered over the court map. The central unit owns the whole run — this
 * panel only mirrors its Status events: `progress` arms a spot (spinner),
 * `resolved` flashes it green (hit) or red (timeout miss), and the `done`
 * session state triggers a DumpResults fetch for the summary.
 *
 * Events carry POSITIONS (slot indices from the pairing round); the map wants
 * canonical spots, so `pairedSpots[position]` translates back — the inverse of
 * the drill builder's `pairedSpots.indexOf(spot)`.
 */
export const SessionPanel = ({
  transport,
  pairedSpots,
}: {
  transport: CentralTransport;
  pairedSpots: number[]; // canonical spots in bind order (slot order)
}) => {
  const [session, setSession] = useState<SessionState>("idle");
  const [armedSpot, setArmedSpot] = useState<number | null>(null); // canonical
  const [flash, setFlash] = useState<{ spot: number; miss: boolean } | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [last, setLast] = useState<LastResolved | null>(null);
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
        setLast({ miss: e.miss, reactionMs: e.reactionMs });
        if (spot != null) {
          setFlash({ spot, miss: e.miss });
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
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

  const running = session === "running";
  const done = session === "done";

  const start = () => {
    setError(null);
    setRecords(null);
    setResolvedCount(0);
    setLast(null);
    setFlash(null);
    transport.startSession().catch((err: unknown) => {
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
    if (flash?.spot === i) return flash.miss ? "miss" : "hit";
    if (running && armedSpot === i) return "active";
    return "available";
  });

  if (pairedSpots.length === 0) {
    return (
      <View style={styles.panel}>
        <AppText center size={13} color={colors.textMuted}>
          Pair your targets first — a session runs on the paired layout
        </AppText>
      </View>
    );
  }

  const hits = records?.filter((r) => !r.miss) ?? [];
  const missCount = (records?.length ?? 0) - hits.length;
  const avgMs =
    hits.length > 0
      ? Math.round(hits.reduce((s, r) => s + r.reactionMs, 0) / hits.length)
      : null;
  const bestMs =
    hits.length > 0 ? Math.min(...hits.map((r) => r.reactionMs)) : null;

  return (
    <View style={styles.panel}>
      <CourtMap spots={visuals}>
        <View style={styles.textSlot}>
          {running ? (
            <>
              <AppText center size={16} weight="600" style={styles.slotText}>
                Step {resolvedCount + 1}
              </AppText>
              <AppText
                center
                size={13}
                color={
                  last === null
                    ? colors.textMuted
                    : last.miss
                      ? colors.danger
                      : colors.success
                }
                style={styles.slotText}
              >
                {last === null
                  ? "React when a target lights up"
                  : last.miss
                    ? "Miss"
                    : `${last.reactionMs} ms`}
              </AppText>
            </>
          ) : done && records !== null ? (
            <>
              <AppText center size={16} weight="600" style={styles.slotText}>
                {hits.length} {hits.length === 1 ? "hit" : "hits"} ·{" "}
                {missCount} {missCount === 1 ? "miss" : "misses"}
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
              Runs the drill loaded in the Drill tab
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
          <CustomPressable onPress={start} style={styles.button}>
            <AppText size={16} weight="600">
              {done ? "Run again" : "Start"}
            </AppText>
          </CustomPressable>
        )}
      </CourtMap>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    marginTop: 24,
    alignItems: "center",
    gap: 12,
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
});
