import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { edgeFades } from "../../helpers/scrollFade";
import { SPOT_CODES, SPOT_NAMES } from "../../domain/spot";
import { colors } from "../../theme";
import { PathChip, type PathChipHandle } from "./PathChip";

/** Imperative handle: Undo asks the strip to drop the LAST step with the same
 *  collapse animation a chip tap runs, so the two removal paths look identical. */
export interface PathChipStripHandle {
  removeLast: () => void;
}

/** Width of the edge fade — wide enough to read as "the strip continues" but
 *  narrow enough to leave the chips under it legible. */
const FADE_W = 28;

/**
 * The ordered Path step chips as one horizontal strip. The path can run to
 * MAX_DRILL_PATH steps, so it scrolls — and to make that OBVIOUS (not just a row
 * that silently runs off the edge) each overflowing side wears a fade to the app
 * background, hinting "there's more this way". The strip also auto-scrolls to
 * its end on each append so the newest step stays in view.
 *
 * Whether an edge fades is pure geometry (edgeFades: offset vs content/container
 * widths); this component only wires the scroll/layout measurements to it and
 * paints the gradient (react-native-svg — already in the app, so no rebuild).
 */
export const PathChipStrip = forwardRef<
  PathChipStripHandle,
  {
    path: number[]; // canonical spot indices, in step order
    onRemove: (index: number) => void;
  }
>(({ path, onRemove }, handleRef) => {
  const ref = useRef<ScrollView>(null);
  const prevLen = useRef(path.length);
  // Live handles to each chip, keyed by step index, so Undo can drive the last
  // one's collapse animation instead of dropping the step instantly.
  const chipRefs = useRef<(PathChipHandle | null)[]>([]);

  useImperativeHandle(handleRef, () => ({
    removeLast: () => chipRefs.current[path.length - 1]?.collapse(),
  }));

  const [offsetX, setOffsetX] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Keep the newest chip in view: scroll to the end whenever a step is appended.
  useEffect(() => {
    if (path.length > prevLen.current) {
      ref.current?.scrollToEnd({ animated: true });
    }
    prevLen.current = path.length;
  }, [path.length]);

  const fades = edgeFades(offsetX, contentW, box.width);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setOffsetX(e.nativeEvent.contentOffset.x);
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={(w) => setContentW(w)}
        testID="path-sequence"
        contentContainerStyle={styles.content}
      >
        {path.map((s, idx) => (
          <PathChip
            key={idx}
            ref={(h) => {
              chipRefs.current[idx] = h;
            }}
            index={idx}
            code={SPOT_CODES[s]}
            label={SPOT_NAMES[s]}
            onRemove={() => onRemove(idx)}
          />
        ))}
      </ScrollView>

      {/* Edge fades — the "there's more" hint. pointerEvents none so they never
          block a tap on the chip beneath. */}
      {fades.left && (
        <EdgeFade side="left" height={box.height} testID="path-fade-left" />
      )}
      {fades.right && (
        <EdgeFade side="right" height={box.height} testID="path-fade-right" />
      )}
    </View>
  );
});
PathChipStrip.displayName = "PathChipStrip";

/** A gradient from the app background at the given edge to transparent inward. */
const EdgeFade = ({
  side,
  height,
  testID,
}: {
  side: "left" | "right";
  height: number;
  testID: string;
}) => {
  const id = `fade-${side}`;
  // Opaque at the edge, transparent toward the middle: left fades 0→1 = solid→
  // clear; right is the mirror.
  const stops =
    side === "left"
      ? [
          { offset: "0", opacity: 1 },
          { offset: "1", opacity: 0 },
        ]
      : [
          { offset: "0", opacity: 0 },
          { offset: "1", opacity: 1 },
        ];
  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[
        styles.fade,
        side === "left" ? styles.fadeLeft : styles.fadeRight,
      ]}
    >
      <Svg width={FADE_W} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s) => (
              <Stop
                key={s.offset}
                offset={s.offset}
                stopColor={colors.background}
                stopOpacity={s.opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width={FADE_W} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    paddingHorizontal: 8,
  },
  fade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: FADE_W,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
});
