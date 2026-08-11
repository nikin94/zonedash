import { StyleSheet } from "react-native";
import Svg, { Path, Polygon } from "react-native-svg";

import { routeSegments } from "../../helpers/pathRoute";

/**
 * The Path drill's route overlay — curved, directed, order-coloured segments
 * between the tapped spots (routeSegments does the geometry). It sits ABOVE the
 * court line markings but BELOW the dots, so a target always stays tappable and
 * reads on top of its own route; pointerEvents none, so it never eats a tap.
 *
 * Rotation is baked into the segment coordinates (routeSegments → rotateNorm,
 * the dots' transform), so the route turns with the view and stays on the
 * targets at every orientation.
 */
export const CourtRoute = ({
  path,
  rotation,
  width,
  height,
}: {
  path: number[]; // canonical spot indices, in step order
  rotation: number;
  width: number;
  height: number;
}) => {
  const segs = routeSegments(path, rotation);
  if (segs.length === 0) return null;
  return (
    <Svg
      width={width}
      height={height}
      pointerEvents="none"
      testID="court-route"
      style={StyleSheet.absoluteFill}
    >
      {segs.map((s, i) => (
        <Path
          key={`p${i}`}
          testID={`route-seg-${i}`}
          d={s.d}
          stroke={s.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {segs.map((s, i) => (
        <Polygon key={`a${i}`} points={s.arrow} fill={s.color} />
      ))}
    </Svg>
  );
};
