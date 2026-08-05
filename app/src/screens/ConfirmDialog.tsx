import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * The app's confirm box — the same one used for the pairing count change.
 * Renders inline (the parent decides where: court centre, header overlay).
 */
export function ConfirmDialog({
  testID,
  title,
  body,
  actions,
}: {
  testID?: string;
  title: string;
  body?: string;
  actions: { label: string; onPress: () => void; danger?: boolean }[];
}) {
  return (
    <View testID={testID} style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {body != null && <Text style={styles.body}>{body}</Text>}
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
            <Text style={styles.buttonLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#fafafa",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    color: "#a1a1aa",
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
    borderColor: "#3f3f46",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  buttonDanger: {
    borderColor: "#7f1d1d",
  },
  buttonPressed: {
    backgroundColor: "#18181b",
  },
  buttonLabel: {
    color: "#fafafa",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
