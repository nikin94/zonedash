import Svg, { Circle } from "react-native-svg";

import { colors } from "../../theme";

/**
 * A target reticle — concentric rings + centre dot — for the Drill tab, the
 * app's core. Drawn from primitives (not a Material glyph) so it reads as "a
 * court target" like the dots on the CourtMap. Stroke follows `color`; the
 * centre dot is filled so it stays legible small.
 */
export const DrillIcon = ({
  size = 26,
  color = colors.background,
}: {
  size?: number;
  color?: string;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
    <Circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={2} fill="none" />
    <Circle cx={12} cy={12} r={1.6} fill={color} />
  </Svg>
);
