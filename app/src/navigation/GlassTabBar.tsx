import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../components/AppText";
import { AccountIcon, DrillIcon, HistoryIcon } from "../components/Icons";
import {
  releaseTabBar,
  suppressTabBar,
  useTabBarSuppressed,
} from "../state/tabBar";
import { alpha, colors, glowShadow } from "../theme";

/**
 * The frosted-glass footer tab bar (Revolut-style): a translucent BlurView strip
 * with the app's core — Drill — as a raised accent button in the centre, and
 * Account / Settings either side. Rendered by the Tab.Navigator, so tapping an
 * item navigates through react-navigation; the transport lives above the
 * navigator (AppState), so switching tabs never touches the BLE link.
 *
 * Only the icons (+ labels) are tappable — each side item is a content-sized
 * Pressable centred in a flex column, and the centre button's target is the
 * disc itself, not the square around it. Press feedback is icon-only opacity;
 * there is no grey surface flash. The centre region has a FIXED width so the two
 * side items split the remaining space evenly — their icons land midway between
 * the centre disc and the screen edge.
 *
 * Presentation only: focus state and the route list come from the navigator.
 */
// Bar geometry — the single source of truth for both the bar itself and the
// content-side clearance a screen must leave so its own bottom content isn't
// hidden behind this floating (translucent) bar.
/** The icon row's height. */
export const TAB_BAR_ROW_H = 58;
/** Floor for the bar's bottom padding. On a device with a home-indicator gap
 *  `insets.bottom` already lifts the icons off the edge; on a square/legacy
 *  device it reports 0, so this keeps the icons from hugging the screen bottom. */
export const TAB_BAR_MIN_BOTTOM = 16;
/** How far the centre (Drill) disc pokes UP above the bar's row — content that
 *  sits under the disc (e.g. a full-width pinned button) must clear this too. */
export const TAB_BAR_DISC_RISE = 22;

/** Vertical space a screen's own bottom content must leave to clear the floating
 *  bar (its row + the home-indicator gap). Add TAB_BAR_DISC_RISE on top for
 *  content under the centre disc. */
export const tabBarClearance = (insetBottom: number): number =>
  TAB_BAR_ROW_H + Math.max(insetBottom, TAB_BAR_MIN_BOTTOM);

const pressStyle = ({ pressed }: { pressed: boolean }) => [
  styles.tap,
  pressed && styles.tapPressed,
];

/** The Drill tab nests a stack (DrillHome + DrillSetup); the setup page is a
 *  full-screen route that wants the footer gone (only its own Done at the
 *  bottom). Hide the whole bar whenever the focused tab's nested stack sits on
 *  DrillSetup — this fires the instant the route is pushed, so the bar never
 *  flashes on OPEN. The close side is handled by TabBarSuppressor (below). */
const hidesTabBar = (state: BottomTabBarProps["state"]): boolean => {
  const focused = state.routes[state.index];
  const nested = focused.state as
    { index?: number; routes?: { name: string }[] } | undefined;
  if (!nested?.routes || nested.index == null) return false;
  return nested.routes[nested.index]?.name === "DrillSetup";
};

/**
 * Mount this for as long as the tab bar should stay hidden. It suppresses the
 * bar on mount and — crucially — releases on UNMOUNT, which react-native-screens
 * defers until a screen's exit animation completes. So the drill-setup page
 * keeps the bar gone through its whole slide-out, instead of the bar snapping
 * back the moment `goBack()` flips the focus state (`hidesTabBar` → false) and
 * covering the still-sliding page.
 */
export const TabBarSuppressor = () => {
  useEffect(() => {
    suppressTabBar();
    return () => releaseTabBar();
  }, []);
  return null;
};

export const GlassTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const suppressed = useTabBarSuppressed();

  // On the drill-setup page the bar steps aside entirely — the page pins its own
  // Done at the bottom, so a floating tab bar over it would be redundant chrome.
  // `hidesTabBar(state)` hides it immediately on OPEN (no first-frame flash);
  // `suppressed` (the setup page's TabBarSuppressor) keeps it hidden through the
  // CLOSE animation, when the focus state has already flipped back to the drill
  // surface but the setup screen is still sliding out over the top of the bar.
  if (suppressed || hidesTabBar(state)) return null;

  const go = (routeName: string, routeKey: string, focused: boolean) => () => {
    const event = navigation.emit({
      type: "tabPress",
      target: routeKey,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM) },
      ]}
    >
      {/* The frost. tint "light" over the white page reads as a subtle glass
          strip; on Android expo-blur falls back to a translucent fill. */}
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const onPress = go(route.name, route.key, focused);

          if (route.name === "Drill") {
            // Fixed-width region so the side items split the rest evenly; the
            // tap target is the disc only (content-sized Pressable), not the
            // square around it.
            return (
              <View key={route.key} style={styles.centerSlot}>
                <Pressable
                  testID="tab-drill"
                  accessibilityRole="button"
                  accessibilityLabel="Drill"
                  onPress={onPress}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.centerButton,
                    pressed && styles.tapPressed,
                  ]}
                >
                  <DrillIcon color={colors.background} size={28} />
                </Pressable>
              </View>
            );
          }

          const color = focused ? colors.accent : colors.textMuted;
          return (
            <View key={route.key} style={styles.item}>
              <Pressable
                testID={`tab-${route.name.toLowerCase()}`}
                accessibilityRole="button"
                accessibilityLabel={route.name}
                onPress={onPress}
                hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                style={pressStyle}
              >
                {route.name === "Account" ? (
                  <AccountIcon color={color} size={26} />
                ) : (
                  <HistoryIcon color={color} size={26} />
                )}
                <AppText size={11} weight="600" color={color}>
                  {route.name}
                </AppText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: alpha(colors.border, 0.4),
    backgroundColor: alpha(colors.background, 0.6), // tint under the blur
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: TAB_BAR_ROW_H,
  },
  // A side column — fills half the remaining space so its centred tap target
  // lands midway between the centre disc and the screen edge.
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Content-sized so only the icon + label react to a tap (hitSlop widens the
  // touch area without a visible box); no grey surface — press dims the icon.
  tap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3,
  },
  tapPressed: {
    opacity: 0.5,
  },
  // Fixed centre region: narrower than a third so the side icons sit further in
  // (centred in the gap), not out at the 1/6 marks.
  centerSlot: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  // The hero: a filled accent disc lifted above the bar so it reads as the
  // primary action, like Revolut's centre button. The disc itself is the tap
  // target — no square hit area around it.
  centerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -TAB_BAR_DISC_RISE,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.background,
    ...glowShadow,
  },
});
