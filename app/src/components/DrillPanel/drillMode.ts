import type { DrillConfig } from "../../ble/transport";
import { formatSeconds } from "../../helpers/time";

/**
 * The drill-setup vocabulary shared by the Drill screen and its settings modal.
 * Extracted from DrillPanel so both the court surface (which runs the drill) and
 * the DrillSettings modal (which edits it) speak the same modes/options without
 * one importing the other's component.
 *
 * UI modes: the engine's `random` and `time` differ only in the stop condition
 * (rep count vs duration window), so the UI folds them into ONE Random mode with
 * a stop-by selector — the wire mode is derived from it and the firmware
 * DrillConfig is untouched.
 */
export type UiMode = "random" | "path" | "live";
export type StopBy = "count" | "time";

export const MODES: { key: UiMode; label: string }[] = [
  { key: "random", label: "Random" },
  { key: "path", label: "Path" },
  { key: "live", label: "Live" },
];

/** One-line explanation per mode, shown in the mode-info modal. */
export const MODE_DESC: Record<UiMode, string> = {
  random: "Targets light in a random order until the session ends.",
  path: "Run a fixed sequence you tap out on the map.",
  live: "Light targets by hand during the run — one tap each.",
};

/** Wheel options for the hits count: 1–99. Duration is a free-typed input now
 *  (whole seconds), so it needs no fixed option list. */
export const COUNT_OPTIONS = Array.from({ length: 99 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

/** Compact one-line summary of the current setup, shown in a muted caption
 *  under the Start button so the operator sees what will run without opening the
 *  setup page — e.g. "Random · 10 hits", "Random · 30s", "Path", "Live". A set
 *  `playerName` leads (name · mode · count), so a coach reads who the run is for
 *  at a glance; an empty/blank name is dropped, leaving just mode · count. */
export const drillSummary = (
  uiMode: UiMode,
  stopBy: StopBy,
  count: number,
  durationMs: number,
  playerName?: string,
): string => {
  const modeAndTail =
    uiMode === "path"
      ? "Path"
      : uiMode === "live"
        ? "Live"
        : `Random · ${
            stopBy === "time"
              ? formatSeconds(durationMs, 0) // whole seconds, slitno ("30s")
              : `${count} ${count === 1 ? "hit" : "hits"}`
          }`;
  const name = playerName?.trim();
  return name ? `${name} · ${modeAndTail}` : modeAndTail;
};

/** Inverse of the wire mode: the UI mode + stop-by a wire config resolves back
 *  to, so a mount over a running/finished session restores the matching
 *  controls. */
export const uiFromWire = (
  mode: DrillConfig["mode"],
): { uiMode: UiMode; stopBy: StopBy } => {
  if (mode === "time") return { uiMode: "random", stopBy: "time" };
  if (mode === "path") return { uiMode: "path", stopBy: "count" };
  if (mode === "live") return { uiMode: "live", stopBy: "count" };
  return { uiMode: "random", stopBy: "count" };
};
