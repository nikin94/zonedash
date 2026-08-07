import { StyleSheet, View } from "react-native";

import { colors } from "../theme";
import { AppText } from "./AppText";
import { Button } from "./Button";

/**
 * The app's confirm box — the same one used for every destructive prompt.
 * Renders inline (the parent decides where: a centered modal card). Its actions
 * route through the shared Button, so they match every other control.
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
        <Button
          key={a.label}
          label={a.label}
          danger={a.danger}
          onPress={a.onPress}
        />
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
});
