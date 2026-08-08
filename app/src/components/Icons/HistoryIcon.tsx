import Svg, { Path } from "react-native-svg";

import { colors } from "../../theme";

// Material Design "history" glyph (Apache-2.0, material-icons `history`) — a
// clock with a counterclockwise arrow, the common "past sessions" affordance.
// Authored on a 24×24 viewBox; the Svg scales it to `size`.
const HISTORY_PATH =
  "M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 " +
  "7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13" +
  " 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z";

/** Clock-with-arrow (Material icon), sized for the 44 px header buttons. */
export const HistoryIcon = ({
  size = 18,
  color = colors.textSecondary,
}: {
  size?: number;
  color?: string;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <Path d={HISTORY_PATH} fill={color} />
  </Svg>
);
