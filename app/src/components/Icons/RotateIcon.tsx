import Svg, { Path } from "react-native-svg";

import { colors } from "../../theme";

// Material Design "autorenew" glyph (Apache-2.0, material-icons `autorenew`) —
// two arrows curving into a loop, the common "rotate" affordance. Authored on a
// 24×24 viewBox; the Svg scales it to `size`.
const ROTATE_PATH =
  "M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45" +
  "-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 " +
  "2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24" +
  "-4.26z";

/** Rotate arrows (Material icon), sized for the court's corner control. */
export const RotateIcon = ({
  size = 18,
  color = colors.textSecondary,
}: {
  size?: number;
  color?: string;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <Path d={ROTATE_PATH} fill={color} />
  </Svg>
);
