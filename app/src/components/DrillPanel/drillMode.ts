import type { DrillConfig } from "../../ble/transport";
import { msOptions } from "../WheelField";

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

/** Wheel options: 1–99 hits, and 15 s–5 min in 15 s steps. */
export const COUNT_OPTIONS = Array.from({ length: 99 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));
export const DURATION_OPTIONS = msOptions(15000, 300000, 15000);

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
