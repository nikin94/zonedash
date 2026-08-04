import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

/**
 * ZoneDash operator app — initial shell. Screens (connect, drill builder, live
 * session, results) land once the BLE link to the central unit exists; see
 * src/ble/contract.ts for the GATT contract this app will speak.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ZoneDash</Text>
      <Text style={styles.subtitle}>Court reaction trainer</Text>
      <View style={styles.statusRow}>
        <View style={styles.dot} />
        <Text style={styles.status}>Central unit: not connected</Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    color: "#fafafa",
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 1,
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#71717a",
  },
  status: {
    color: "#71717a",
    fontSize: 13,
  },
});
