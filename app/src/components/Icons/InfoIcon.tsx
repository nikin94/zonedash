import Svg, { Circle, Line } from "react-native-svg";

import { colors } from "../../theme";

/**
 * An "i" in a circle — the info affordance next to the Mode selector, opening
 * the drill-modes modal. Drawn from primitives (not a glyph font) so it renders
 * identically per platform; stroke + dot follow `color`.
 */
export const InfoIcon = ({
  size = 18,
  color = colors.textMuted,
}: {
  size?: number;
  color?: string;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
    <Circle cx={12} cy={7.6} r={1.35} fill={color} />
    <Line
      x1={12}
      y1={11}
      x2={12}
      y2={16.6}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);
