import { StyleSheet, View } from "react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";
import { CustomPressable } from "./CustomPressable";

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
    <AppText center size={16} weight="600">
      {title}
    </AppText>
    {body != null && (
      <AppText center size={13} color={colors.textSecondary} style={styles.body}>
        {body}
      </AppText>
    )}
    <View style={styles.row}>
      {actions.map((a) => (
        <CustomPressable
          key={a.label}
          onPress={a.onPress}
          style={[styles.button, a.danger && styles.buttonDanger]}
        >
          <AppText center size={16} weight="600">
            {a.label}
          </AppText>
        </CustomPressable>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    gap: 8,
  },
  body: {
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
});
