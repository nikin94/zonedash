import { useEffect, useRef, useState } from "react";

/**
 * Debounce-latch: returns the last SETTLED `value` and only adopts a new one
 * after its `key` has stayed unchanged for `ms`. The first value is adopted
 * immediately; while a burst of changes is still in flight the previous settled
 * value is held, so a consumer that reacts to it (rebuilding an animation, say)
 * fires once the edits pause rather than on every change.
 *
 * `key` is the change signal — a stable string derived from `value` (e.g. an
 * array joined), since `value` is typically a fresh reference each render.
 */
export const useSettled = <T>(value: T, key: string, ms: number): T => {
  const [settled, setSettled] = useState(value);
  const settledKey = useRef(key);

  useEffect(() => {
    if (key === settledKey.current) return; // already the settled value
    const id = setTimeout(() => {
      settledKey.current = key;
      setSettled(value);
    }, ms);
    return () => clearTimeout(id); // a further change resets the quiet window
  }, [key, value, ms]);

  return settled;
};
