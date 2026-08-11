import { StyleSheet } from "react-native";
import Svg, { Line } from "react-native-svg";

import { courtLinePixels } from "../../helpers/courtLines";
import { alpha, colors } from "../../theme";

/**
 * The court's interior line markings, drawn as one faint SVG overlay filling the
 * court box. A pure display layer: it sits BELOW the dots and takes no touches
 * (pointerEvents none), so it never competes with a target for a tap. The lines
 * are drawn fainter than the court box border — a schematic backdrop, not
 * chrome that distracts from the buttons.
 *
 * Rotation is baked into the segment coordinates (courtLinePixels → rotateNorm),
 * the exact transform the dots use, so the markings turn with the view and stay
 * aligned to the targets at every orientation.
 */
export const CourtLines = ({
  rotation,
  width,
  height,
}: {
  rotation: number;
  width: number;
  height: number;
}) => (
  <Svg
    width={width}
    height={height}
    pointerEvents="none"
    style={StyleSheet.absoluteFill}
  >
    {courtLinePixels(rotation, width, height).map((s, i) => (
      <Line
        key={i}
        testID={`court-line-${i}`}
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
        stroke={alpha(colors.border, 0.4)}
        strokeWidth={1}
      />
    ))}
  </Svg>
);
