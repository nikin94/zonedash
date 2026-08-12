import { memo, useCallback, useEffect, useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";

import { dismissToast, useToast, type Toast, type ToastTone } from "../../state/toast";
import { alpha, colors, glowShadow } from "../../theme";
import { AppText } from "../AppText";

/** Drop distance the card animates in from / out to (px). */
const OFFSET = 14;
/** Enter / exit animation durations (ms). */
const ENTER_MS = 220;
const EXIT_MS = 160;
/** Swipe-up past this many px (or faster than this upward velocity) dismisses. */
const SWIPE_DISMISS_DY = 24;
const SWIPE_DISMISS_VY = -0.5;

/** Whether a release with drag `dy` / velocity `vy` should dismiss the toast:
 *  a decisive upward flick (past the distance OR the velocity threshold). Pure,
 *  so the threshold is unit-tested; the gesture plumbing is device-verified. */
export const shouldSwipeDismiss = (dy: number, vy: number): boolean =>
  dy < -SWIPE_DISMISS_DY || vy < SWIPE_DISMISS_VY;

/** The left accent bar colour per tone. */
const TONE_BAR: Record<ToastTone, string> = {
  neutral: colors.accent,
  success: colors.success,
  danger: colors.danger,
};

/**
 * The app-wide toast host: renders the current toast (toast store) as a small
 * card that slides in under the header, auto-dismisses after its duration, and
 * can be flicked up to dismiss early. Mounted once, in the header — a run that
 * finishes on another tab can still surface its "done" here.
 *
 * It subscribes to the toast store via `useToast`, so ONLY this host re-renders
 * when a toast fires — nothing else in the tree. memo keeps an unrelated header
 * re-render (connection state) from re-rendering it. Each toast is keyed by its
 * id, so a new one fully remounts the card: fresh animated values and timer, no
 * manual reset. Presentation only — `showToast` (anywhere) drives it.
 */
export const ToastHost = memo(() => {
  const toast = useToast();
  if (toast === null) return null;
  // key by id: a new toast remounts the card fresh (own animation + timer).
  return <ToastCard key={toast.id} toast={toast} />;
});
ToastHost.displayName = "ToastHost";

const ToastCard = ({ toast }: { toast: Toast }) => {
  // translateY carries BOTH the enter/exit slide and the finger during a drag;
  // opacity fades with it. Native driver — transform + opacity only, off the JS
  // thread (the animation idiom the rest of the app uses).
  const translateY = useRef(new Animated.Value(-OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Guards a double-dismiss: the auto-timer and a swipe can't both fire the exit.
  const dismissing = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -OFFSET,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Clears the store only if this is still the shown toast (a newer one
      // that replaced it mid-exit is left untouched).
      dismissToast(toast.id);
    });
  }, [toast.id, opacity, translateY]);

  // Enter on mount and arm the auto-dismiss timer for this toast's duration.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
    ]).start();
    const t = setTimeout(dismiss, toast.durationMs);
    return () => clearTimeout(t);
  }, [toast.durationMs, dismiss, opacity, translateY]);

  // Flick up to dismiss; a small downward drag springs back.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        // Follow the finger upward; clamp downward so it barely gives.
        translateY.setValue(g.dy < 0 ? g.dy : g.dy * 0.25);
      },
      onPanResponderRelease: (_e, g) => {
        if (shouldSwipeDismiss(g.dy, g.vy)) {
          dismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Animated.View
        testID="toast"
        accessibilityRole="alert"
        accessibilityLabel={toast.message}
        {...pan.panHandlers}
        style={[styles.card, { opacity, transform: [{ translateY }] }]}
      >
        <View style={[styles.bar, { backgroundColor: TONE_BAR[toast.tone] }]} />
        <AppText size={14} weight="600" style={styles.message} numberOfLines={2}>
          {toast.message}
        </AppText>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Anchored to the bottom edge of the header (top: 100%), spanning its width;
  // box-none so only the card itself catches touches, never the empty span.
  wrap: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha(colors.border, 0.6),
    backgroundColor: colors.background,
    ...glowShadow,
  },
  // A slim accent bar so the toast reads as app chrome, not a system alert.
  bar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  message: {
    flex: 1,
  },
});
