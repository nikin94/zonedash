import Svg, { Circle } from "react-native-svg";

import { colors } from "../../theme";

/**
 * A vertical ellipsis (⋮) — the overflow-menu affordance (e.g. History's Clear
 * action). Three filled dots stacked, drawn from primitives so it renders
 * identically per platform; the dots follow `color`.
 */
export const MoreIcon = ({
  size = 20,
  color = colors.textSecondary,
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    accessibilityElementsHidden
  >
    <Circle cx={12} cy={5} r={1.9} fill={color} />
    <Circle cx={12} cy={12} r={1.9} fill={color} />
    <Circle cx={12} cy={19} r={1.9} fill={color} />
  </Svg>
);
