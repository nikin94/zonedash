import { render, screen } from "@testing-library/react-native";

import { colors } from "../theme";
import { AppText, DEFAULT_TEXT_SIZE } from "./AppText";

test("renders with the themed defaults; props set size/weight/color/center", () => {
  render(
    <>
      <AppText testID="plain">plain</AppText>
      <AppText testID="propped" size={16} weight="600" color={colors.success} center>
        propped
      </AppText>
    </>,
  );
  expect(screen.getByTestId("plain")).toHaveStyle({
    color: colors.text,
    fontSize: DEFAULT_TEXT_SIZE,
  });
  expect(screen.getByTestId("propped")).toHaveStyle({
    fontSize: 16,
    fontWeight: "600",
    color: colors.success,
    textAlign: "center",
  });
});

test("a passed style still overrides the props", () => {
  render(
    <AppText testID="styled" color={colors.danger} style={{ color: colors.success }}>
      styled
    </AppText>,
  );
  expect(screen.getByTestId("styled")).toHaveStyle({ color: colors.success });
});
