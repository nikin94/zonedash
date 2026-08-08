import { fireEvent, render, screen } from "@testing-library/react-native";

import { ConfirmModal } from "./ConfirmModal";

const actions = [{ label: "OK", onPress: () => {} }];

test("renders its content only while visible", () => {
  const { rerender } = render(
    <ConfirmModal
      visible={false}
      onDismiss={() => {}}
      title="Disconnect?"
      actions={actions}
    />,
  );
  expect(screen.queryByText("Disconnect?")).toBeNull(); // hidden while not visible

  rerender(
    <ConfirmModal
      visible
      onDismiss={() => {}}
      title="Disconnect?"
      actions={actions}
    />,
  );
  expect(screen.getByText("Disconnect?")).toBeTruthy();
});

test("a tap on the scrim backdrop dismisses (same as cancel)", () => {
  const onDismiss = jest.fn();
  render(
    <ConfirmModal
      visible
      onDismiss={onDismiss}
      testID="disconnect-confirm"
      title="Disconnect?"
      actions={actions}
    />,
  );

  fireEvent.press(screen.getByTestId("disconnect-confirm-backdrop"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("wires each action's onPress through the dialog", () => {
  const yes = jest.fn();
  render(
    <ConfirmModal
      visible
      onDismiss={() => {}}
      title="Sure?"
      actions={[{ label: "Yes", danger: true, onPress: yes }]}
    />,
  );

  fireEvent.press(screen.getByText("Yes"));
  expect(yes).toHaveBeenCalledTimes(1);
});
