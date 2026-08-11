import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { polylineLength, routePolyline } from "../../helpers/pathRoute";
import { useSettled } from "../../helpers/useSettled";
import { colors } from "../../theme";

/** Marker diameter, px. */
const MARK = 14;
/** Travel speed along the route, px per ms — a calm, readable pace. */
const SPEED = 0.14;
/** Clamp the full-loop duration so a tiny route isn't a blur and a long one
 *  isn't a crawl. */
const MIN_MS = 900;
const MAX_MS = 6000;
/** Quiet window after the last edit before the loop rebuilds. While the operator
 *  keeps tapping out a path, the marker keeps looping the previous track instead
 *  of restarting on every step — only once the edits settle does it adopt the
 *  new sequence and play it from the top. */
const SETTLE_MS = 450;

/**
 * The Path route's animated preview: a single marker that loops along the route
 * curve, tracing the sequence so its shape and direction read at a glance
 * without a play button.
 *
 * It restarts from the first spot when the path changes — but NOT on every tap:
 * the committed track is debounced (SETTLE_MS), so authoring a long path in a
 * quick burst doesn't keep resetting the marker mid-loop (it would never finish
 * a pass). The marker loops the last settled sequence until the tapping pauses,
 * then rebuilds and plays the new one from the top. A view rotation is a
 * deliberate one-off, so it applies immediately.
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
  // The track follows a SETTLED copy of the path: rapid edits hold the previous
  // sequence rather than restarting the loop, so a quick burst doesn't keep
  // resetting the marker mid-pass — it rebuilds once, when the tapping pauses.
  const drawn = useSettled(path, path.join(","), SETTLE_MS);

  // Rotation applies immediately (a deliberate one-off); only the path lags.
  const trackSig = `${drawn.join(",")}|${rotation}`;
  const pts = useMemo(() => routePolyline(drawn, rotation), [trackSig]); // eslint-disable-line react-hooks/exhaustive-deps

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
    progress.setValue(0); // restart from the first spot on a settled path change
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
