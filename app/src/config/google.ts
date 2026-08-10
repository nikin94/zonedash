/**
 * Google Sign-In client IDs, read from Expo public env vars (inlined at build
 * time, like the Supabase config). Returns null when the web client id is unset
 * — the auth provider then can't offer Google sign-in and the app stays local-
 * only, exactly as it works without a backend.
 *
 * Only the WEB client id is required: @react-native-google-signin uses it as the
 * `webClientId` (Android reads it + the console-registered SHA-1; there is no
 * per-app Android client id to embed) and it is also the audience Supabase Auth
 * validates the id token against. The iOS client id is needed on iOS so the
 * native SDK can present the account picker; it's optional here so an Android-
 * only build still works. None of these are secrets — they ship in the client.
 */
export interface GoogleConfig {
  /** OAuth **web** client id — the id-token audience + Android's client id. */
  webClientId: string;
  /** OAuth **iOS** client id — required on iOS, optional elsewhere. */
  iosClientId: string | null;
}

/** The Google config, or null when the web client id is missing (→ no Google
 *  sign-in; the app stays local-only). */
export const getGoogleConfig = (): GoogleConfig | null => {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) return null;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return { webClientId, iosClientId: iosClientId || null };
};
