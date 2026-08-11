import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { polylineLength, routePolyline } from "../../helpers/pathRoute";
import { colors } from "../../theme";

/** Marker diameter, px. */
const MARK = 14;
/** Travel speed along the route, px per ms — a calm, readable pace. */
const SPEED = 0.14;
/** Clamp the full-loop duration so a tiny route isn't a blur and a long one
 *  isn't a crawl. */
const MIN_MS = 900;
const MAX_MS = 6000;

/**
 * The Path route's animated preview: a single marker that loops along the route
 * curve, tracing the sequence so its shape and direction read at a glance
 * without a play button. It runs continuously and RESTARTS from the first spot
 * whenever the path changes (a step added or removed), so the newest sequence
 * always plays from the top.
 *
 * It rides the EXACT curve the drawn segments use — both derive from
 * routeQuadratics (pathRoute.ts) — sampled into one pixel polyline. A single
 * looping Animated.Value indexes that polyline and interpolates translateX/Y,
 * so the motion runs on the native driver (transform-only), off the JS thread —
 * the same reason AnimatedDot's fade is native. Presentation only, below the
 * dots and taking no touches (pointerEvents none), so it never eats a tap.
 */
export const RoutePreview = ({
  path,
  rotation,
}: {
  path: number[]; // canonical spot indices, in step order
  rotation: number;
}) => {
  // A change in the step sequence (or the view) rebuilds the track and restarts
  // the loop; the signature keys both the memo and the restart effect.
  const sig = `${path.join(",")}|${rotation}`;
  const pts = useMemo(() => routePolyline(path, rotation), [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useRef(new Animated.Value(0)).current;

  const track = useMemo(() => {
    if (pts.length < 2) return null;
    const input = pts.map((_, i) => i);
    return {
      last: pts.length - 1,
      x: { inputRange: input, outputRange: pts.map((p) => p.x) },
      y: { inputRange: input, outputRange: pts.map((p) => p.y) },
      durationMs: Math.min(
        MAX_MS,
        Math.max(MIN_MS, polylineLength(pts) / SPEED),
      ),
    };
  }, [pts]);

  useEffect(() => {
    if (track === null) return;
    progress.setValue(0); // restart from the first spot on every path change
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: track.last,
        duration: track.durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [track, progress]);

  if (track === null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      testID="route-preview"
      style={[
        styles.mark,
        {
          transform: [
            { translateX: progress.interpolate(track.x) },
            { translateY: progress.interpolate(track.y) },
          ],
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  // Centred on the interpolated point: the negative offsets put the dot's
  // middle on the curve, not its top-left. A white ring lifts it off the route
  // line and the court markings underneath.
  mark: {
    position: "absolute",
    left: -MARK / 2,
    top: -MARK / 2,
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
  },
});
