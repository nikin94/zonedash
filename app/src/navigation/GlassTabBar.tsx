import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../components/AppText";
import { CustomPressable } from "../components/CustomPressable";
import { AccountIcon, DrillIcon, SlidersIcon } from "../components/Icons";
import { alpha, colors, glowShadow } from "../theme";

/**
 * The frosted-glass footer tab bar (Revolut-style): a translucent BlurView strip
 * with the app's core — Drill — as a raised accent button in the centre, and
 * Account / Settings either side. Rendered by the Tab.Navigator, so tapping an
 * item navigates through react-navigation; the transport lives above the
 * navigator (AppState), so switching tabs never touches the BLE link.
 *
 * Presentation only: focus state and the route list come from the navigator.
 */
export const GlassTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  const go = (routeName: string, routeKey: string, focused: boolean) => () => {
    const event = navigation.emit({
      type: "tabPress",
      target: routeKey,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {/* The frost. tint "light" over the white page reads as a subtle glass
          strip; on Android expo-blur falls back to a translucent fill. */}
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const onPress = go(route.name, route.key, focused);

          if (route.name === "Drill") {
            return (
              <CustomPressable
                key={route.key}
                testID="tab-drill"
                accessibilityLabel="Drill"
                onPress={onPress}
                style={styles.centerWrap}
              >
                <View style={styles.centerButton}>
                  <DrillIcon color={colors.background} size={26} />
                </View>
              </CustomPressable>
            );
          }

          const color = focused ? colors.accent : colors.textMuted;
          return (
            <CustomPressable
              key={route.key}
              testID={`tab-${route.name.toLowerCase()}`}
              accessibilityLabel={route.name}
              onPress={onPress}
              style={styles.item}
            >
              {route.name === "Account" ? (
                <AccountIcon color={color} size={22} />
              ) : (
                <SlidersIcon color={color} />
              )}
              <AppText size={11} weight="600" color={color}>
                {route.name}
              </AppText>
            </CustomPressable>
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
    height: 58,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // The hero: a filled accent disc lifted above the bar so it reads as the
  // primary action, like Revolut's centre button.
  centerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.background,
    ...glowShadow,
  },
});
