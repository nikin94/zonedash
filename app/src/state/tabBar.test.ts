import {
  isTabBarSuppressed,
  releaseTabBar,
  resetTabBarSuppression,
  suppressTabBar,
} from "./tabBar";

afterEach(() => resetTabBarSuppression());

test("suppress then release toggles the flag", () => {
  expect(isTabBarSuppressed()).toBe(false);
  suppressTabBar();
  expect(isTabBarSuppressed()).toBe(true);
  releaseTabBar();
  expect(isTabBarSuppressed()).toBe(false);
});

test("it ref-counts — an inner release doesn't un-hide while an outer suppress is up", () => {
  suppressTabBar();
  suppressTabBar();
  releaseTabBar();
  expect(isTabBarSuppressed()).toBe(true); // one still holds it
  releaseTabBar();
  expect(isTabBarSuppressed()).toBe(false);
});

test("release clamps at zero — a stray release never drives the count negative", () => {
  releaseTabBar(); // no matching suppress
  expect(isTabBarSuppressed()).toBe(false);
  suppressTabBar();
  expect(isTabBarSuppressed()).toBe(true); // one suppress still hides, not net -1+1
});

test("reset drops every suppression at once", () => {
  suppressTabBar();
  suppressTabBar();
  resetTabBarSuppression();
  expect(isTabBarSuppressed()).toBe(false);
});
