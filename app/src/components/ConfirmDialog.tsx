import { Pressable, StyleSheet, View } from "react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";

/**
 * The app's confirm box — the same one used for the pairing count change.
 * Renders inline (the parent decides where: court centre, header overlay).
 */
export const ConfirmDialog = ({
  testID,
  title,
  body,
  actions,
}: {
  testID?: string;
  title: string;
  body?: string;
  actions: { label: string; onPress: () => void; danger?: boolean }[];
}) => (
  <View testID={testID} style={styles.box}>
    <AppText style={styles.title}>{title}</AppText>
    {body != null && <AppText style={styles.body}>{body}</AppText>}
    <View style={styles.row}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          onPress={a.onPress}
          style={({ pressed }) => [
            styles.button,
            a.danger && styles.buttonDanger,
            pressed && styles.buttonPressed,
          ]}
        >
          <AppText style={styles.buttonLabel}>{a.label}</AppText>
        </Pressable>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  // Fingertip-sized (~48 px tall), matching the app's action buttons.
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  buttonDanger: {
    borderColor: colors.dangerBorder,
  },
  buttonPressed: {
    backgroundColor: colors.surface,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
