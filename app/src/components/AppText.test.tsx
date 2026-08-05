import { render, screen } from "@testing-library/react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";

test("renders with the themed default color; passed styles override it", () => {
  render(
    <>
      <AppText testID="plain">plain</AppText>
      <AppText testID="styled" style={{ color: colors.success }}>
        styled
      </AppText>
    </>,
  );
  expect(screen.getByTestId("plain")).toHaveStyle({ color: colors.text });
  expect(screen.getByTestId("styled")).toHaveStyle({ color: colors.success });
});
