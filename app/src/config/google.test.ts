import { getGoogleConfig } from "./google";

const WEB = "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID";
const IOS = "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID";

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved[WEB] = process.env[WEB];
  saved[IOS] = process.env[IOS];
  delete process.env[WEB];
  delete process.env[IOS];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("web client id set → config, ios optional and null when unset", () => {
  process.env[WEB] = "web-123.apps.googleusercontent.com";
  expect(getGoogleConfig()).toEqual({
    webClientId: "web-123.apps.googleusercontent.com",
    iosClientId: null,
  });
});

test("both set → both carried through", () => {
  process.env[WEB] = "web-123";
  process.env[IOS] = "ios-456";
  expect(getGoogleConfig()).toEqual({ webClientId: "web-123", iosClientId: "ios-456" });
});

test("no web client id → null (no Google sign-in, app stays local-only)", () => {
  expect(getGoogleConfig()).toBeNull(); // neither set
  process.env[IOS] = "ios-456";
  expect(getGoogleConfig()).toBeNull(); // ios alone is not enough
});

test("an empty web client id counts as unset", () => {
  process.env[WEB] = "";
  expect(getGoogleConfig()).toBeNull();
});
