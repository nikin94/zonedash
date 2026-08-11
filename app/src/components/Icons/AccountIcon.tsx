import Svg, { Path } from "react-native-svg";

import { colors } from "../../theme";

// Material Design "person" glyph (Apache-2.0) — the account affordance. Authored
// on a 24×24 viewBox; the Svg scales it to `size`.
const ACCOUNT_PATH =
  "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 " +
  "1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";

/** Person icon (Material) for the Account tab. */
export const AccountIcon = ({
  size = 24,
  color = colors.textSecondary,
}: {
  size?: number;
  color?: string;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
    <Path d={ACCOUNT_PATH} fill={color} />
  </Svg>
);
