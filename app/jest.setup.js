// Jest environment setup.
//
// AsyncStorage ships a native module with no JS fallback, so importing it under
// jest throws ("NativeModule: AsyncStorage is null"). Its maintainers publish an
// in-memory mock for exactly this; register it globally so any test touching the
// persistence layer gets a working, isolated store.
// https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
