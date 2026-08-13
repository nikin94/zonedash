import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadPrefs, savePrefs } from "./prefs";

const KEY = "zonedash:prefs:v1";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("load returns {} when nothing is stored", async () => {
  expect(await loadPrefs()).toEqual({});
});

test("save then load round-trips the durable prefs", async () => {
  await savePrefs({
    settings: { delayMs: 1500, allowImmediateRepeat: true },
    courtRotation: 2,
    playerName: "Alice",
  });
  expect(await loadPrefs()).toEqual({
    settings: { delayMs: 1500, allowImmediateRepeat: true },
    courtRotation: 2,
    playerName: "Alice",
  });
});

test("a partial blob loads only the keys it has", async () => {
  await savePrefs({ courtRotation: 3 });
  const p = await loadPrefs();
  expect(p.courtRotation).toBe(3);
  expect(p.settings).toBeUndefined();
});

// Corrupt storage must never crash boot — load falls back to "no prefs".
test("load tolerates a corrupt value and returns {}", async () => {
  await AsyncStorage.setItem(KEY, "{not json");
  expect(await loadPrefs()).toEqual({});
});

// A non-object JSON value (e.g. an old/foreign write) is also treated as empty.
test("load treats a non-object JSON value as empty", async () => {
  await AsyncStorage.setItem(KEY, "42");
  expect(await loadPrefs()).toEqual({});
});
