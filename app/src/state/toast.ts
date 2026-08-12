import { useSyncExternalStore } from "react";

/** How long a toast stays up before it auto-dismisses, in ms. One knob — bump
 *  it here to change every toast's on-screen time in the whole app. */
export const TOAST_DEFAULT_MS = 3000;

/** Accent of a toast — a subtle left bar / dot colour, nothing more. */
export type ToastTone = "neutral" | "success" | "danger";

export interface Toast {
  /** Monotonic id — a fresh one on each showToast, so the host can key its
   *  enter animation and auto-dismiss timer to the exact toast even when the
   *  same message repeats, and a stale timer can't clear a newer one. */
  id: number;
  message: string;
  tone: ToastTone;
  /** Auto-dismiss delay for THIS toast (defaults to TOAST_DEFAULT_MS). */
  durationMs: number;
}

/**
 * A tiny app-wide toast store, read through useSyncExternalStore.
 *
 * `showToast` is a plain module function callable from ANYWHERE — an effect, an
 * event handler, a non-React module — WITHOUT a hook. A caller therefore never
 * subscribes and never re-renders just to fire a toast. Only the single host
 * that renders the toast (ToastHost) calls `useToast`, so a toast re-renders
 * that host alone and nothing else in the tree. That is the whole reason this
 * is an external store and not React context: context would re-render every
 * consumer on each toast.
 */
let current: Toast | null = null;
let nextId = 1;
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

// A stable snapshot reference between emits — required by useSyncExternalStore
// (a fresh object each call would loop). `current` only changes on show/dismiss.
const getSnapshot = (): Toast | null => current;

/**
 * Show a toast. Callable anywhere — no hook, no re-render of the caller.
 * Returns the new toast's id so the caller (or the host) can later dismiss
 * exactly this one.
 */
export const showToast = (
  message: string,
  opts?: { tone?: ToastTone; durationMs?: number },
): number => {
  current = {
    id: nextId++,
    message,
    tone: opts?.tone ?? "neutral",
    durationMs: opts?.durationMs ?? TOAST_DEFAULT_MS,
  };
  emit();
  return current.id;
};

/**
 * Dismiss the current toast. Pass an id to dismiss ONLY if that toast is still
 * the one showing — so a stale auto-dismiss timer (or a finished exit
 * animation) can't clear a newer toast that already replaced it.
 */
export const dismissToast = (id?: number): void => {
  if (current === null) return;
  if (id !== undefined && current.id !== id) return;
  current = null;
  emit();
};

/** Imperative read of the current toast — for tests and non-React call sites. */
export const getToast = (): Toast | null => current;

/**
 * Subscribe to the current toast. Only the host that renders it should call
 * this, so a toast re-renders that host alone.
 */
export const useToast = (): Toast | null =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
