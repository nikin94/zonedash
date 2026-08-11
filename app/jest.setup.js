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

// react-native-gesture-handler needs its jest setup to stub the native module so
// react-navigation (which builds on it) renders under jest. Must run in a
// setupFile, before the test framework touches the view tree.
require("react-native-gesture-handler/jestSetup");

// react-native-safe-area-context's real SafeAreaProvider renders its children
// only after an onLayout that never fires under the test renderer, so the whole
// tree comes up empty. Its documented jest mock renders children immediately
// with zero insets — what every navigation test needs.
jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
  };
});
