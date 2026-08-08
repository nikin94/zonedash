import { fireEvent, render, screen } from "@testing-library/react-native";

import { ConfirmDialog } from "./ConfirmDialog";

test("renders the title, and the body only when one is given", () => {
  const { rerender } = render(
    <ConfirmDialog title="Disconnect?" actions={[{ label: "OK", onPress: () => {} }]} />,
  );
  expect(screen.getByText("Disconnect?")).toBeTruthy();
  expect(screen.queryByText("This drops the link.")).toBeNull(); // no body prop

  rerender(
    <ConfirmDialog
      title="Disconnect?"
      body="This drops the link."
      actions={[{ label: "OK", onPress: () => {} }]}
    />,
  );
  expect(screen.getByText("This drops the link.")).toBeTruthy();
});

test("renders one Button per action and fires the tapped one only", () => {
  const no = jest.fn();
  const yes = jest.fn();
  render(
    <ConfirmDialog
      title="Sure?"
      actions={[
        { label: "No", onPress: no },
        { label: "Yes", danger: true, onPress: yes },
      ]}
    />,
  );

  fireEvent.press(screen.getByText("Yes"));
  expect(yes).toHaveBeenCalledTimes(1);
  expect(no).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText("No"));
  expect(no).toHaveBeenCalledTimes(1);
  expect(yes).toHaveBeenCalledTimes(1); // unchanged
});

test("passes testID through to the box for the parent to target", () => {
  render(
    <ConfirmDialog
      testID="disconnect-confirm"
      title="Sure?"
      actions={[{ label: "OK", onPress: () => {} }]}
    />,
  );
  expect(screen.getByTestId("disconnect-confirm")).toBeTruthy();
});
