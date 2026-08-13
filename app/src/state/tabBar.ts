import { useSyncExternalStore } from "react";

/**
 * Whether the floating footer tab bar is currently suppressed — a tiny app-wide
 * flag read through useSyncExternalStore, mirroring the toast store.
 *
 * The drill-setup page hides the tab bar. It CANNOT drive that off the
 * navigator's focus state: on Done the focus flips back to the drill surface the
 * instant `goBack()` starts, while react-native-screens keeps the setup screen
 * mounted through its slide-out — so a focus-based hide snaps the bar back
 * mid-animation and covers the still-sliding page. Instead the page mounts a
 * suppressor for its whole lifetime (the release fires on UNMOUNT, which
 * screens defers until the exit animation completes), and the bar stays gone
 * until then.
 *
 * A ref COUNT (not a boolean) so overlapping mounts can't clobber each other.
 * Like the toast store this is a module singleton, not context — the tab bar is
 * the one subscriber, so a suppress/release re-renders only it.
 */
let hideCount = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// A primitive snapshot (boolean) — stable between emits, so no useSyncExternalStore loop.
const getSnapshot = (): boolean => hideCount > 0;

/** Suppress the tab bar (ref-counted) — pair every call with releaseTabBar. */
export const suppressTabBar = (): void => {
  hideCount += 1;
  emit();
};

/** Release one suppression. */
export const releaseTabBar = (): void => {
  hideCount = Math.max(0, hideCount - 1);
  emit();
};

/** Imperative read — for tests and non-React call sites. */
export const isTabBarSuppressed = (): boolean => hideCount > 0;

/** Drop every suppression — test cleanup between renders. */
export const resetTabBarSuppression = (): void => {
  if (hideCount === 0) return;
  hideCount = 0;
  emit();
};

/** Subscribe to the suppression flag — only the tab bar host should call this. */
export const useTabBarSuppressed = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
