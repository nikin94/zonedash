import { render, screen } from "@testing-library/react-native";

import { act } from "react-test-renderer";

import {
  isTabBarSuppressed,
  resetTabBarSuppression,
  suppressTabBar,
} from "../state/tabBar";
import { GlassTabBar, TabBarSuppressor } from "./GlassTabBar";

afterEach(() => resetTabBarSuppression());

// A minimal bottom-tab state with the Drill tab focused on its DrillHome route —
// i.e. NOT on DrillSetup, the exact state the navigator flips to the instant Done
// starts the setup's slide-out. `hidesTabBar` returns false here, so only the
// suppression flag can keep the bar hidden through that animation.
const homeState = {
  index: 1,
  routes: [
    { key: "Account-1", name: "Account" },
    {
      key: "Drill-1",
      name: "Drill",
      state: { index: 0, routes: [{ key: "DrillHome-1", name: "DrillHome" }] },
    },
    { key: "History-1", name: "History" },
  ],
};
const navigation = {
  emit: () => ({ defaultPrevented: false }),
  navigate: () => {},
};

const renderBar = () =>
  // Only `state` + `navigation` are read; spread an `as any` bag so the unused
  // descriptors/insets props needn't be faked.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<GlassTabBar {...({ state: homeState, navigation } as any)} />);

test("the suppressor hides the bar on mount and releases on unmount", () => {
  expect(isTabBarSuppressed()).toBe(false);
  const { unmount } = render(<TabBarSuppressor />);
  expect(isTabBarSuppressed()).toBe(true);
  // Screens defers the real unmount to the animation's end, so releasing there is
  // what keeps the bar gone through the close.
  unmount();
  expect(isTabBarSuppressed()).toBe(false);
});

test("the bar hides while suppressed even though the focus is back on the drill surface", () => {
  // Focus on DrillHome (not DrillSetup): without suppression the bar is up.
  renderBar();
  expect(screen.getByTestId("tab-account")).toBeTruthy();

  // Suppress (as the still-mounted, sliding-out setup page does) → the bar goes,
  // regardless of the focus state having already flipped back.
  act(() => suppressTabBar());
  expect(screen.queryByTestId("tab-account")).toBeNull();
});
