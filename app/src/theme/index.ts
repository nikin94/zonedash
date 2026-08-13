/**
 * ZoneDash light theme — the single source for every color in the app. Built
 * for high contrast in bright rooms (courts, gyms): a white page, near-black
 * text, strong outlines, and saturated status colors that read under glare.
 * Components must pull from here; no inline hex values in styles.
 */
export const colors = {
  background: "#ffffff", // app + button/dropdown fill
  surface: "#f4f4f5", // pressed states, neutral active pill, prompted dot
  surfaceAlt: "#e4e4e7", // wheel selection band
  border: "#a1a1aa", // strong outlines — visible under glare
  text: "#18181b", // near-black primary text
  textSecondary: "#52525b", // labels, headings
  textMuted: "#71717a", // hints, inactive chips, idle indicator
  accent: "#4f46e5", // selection (path steps, armed dots, open pill border)
  accentPressed: "#6366f1", // pressed state of an accent-filled button — a
  // lighter indigo, so the white label stays legible instead of washing out
  accentSurface: "#eef2ff", // active pill fill (pale indigo tint)
  accentText: "#3730a3", // text/label on accentSurface
  success: "#059669", // bound/hit dots, done text, connected indicator
  warning: "#d97706", // awaiting-confirm dot — amber-600 reads on white
  danger: "#dc2626", // errors, error indicator
  dangerBorder: "#dc2626", // destructive confirm button
  dim: "#a1a1aa", // available court dots — filled, visible under glare
  dimSoft: "#d4d4d8", // zinc-300 — lighter neutral for court-target depth (restyle)
  shadow: "#000", // floating-chrome drop shadow
  scrim: "#000", // modal dim base (used at partial alpha)
} as const;

/** hex (#rgb or #rrggbb) → rgba string, for styles that need an explicit
 *  alpha. Shorthand is expanded first — parsing "#fff" as one 6-digit number
 *  would silently produce a garbage color. */
export const alpha = (hex: string, a: number): string => {
  const h =
    hex.length === 4
      ? [...hex.slice(1)].map((c) => c + c).join("")
      : hex.slice(1);
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Soft drop shadow shared by floating chrome (wheel dropdown, menu, confirm
 *  card) to lift it off the white page. */
export const glowShadow = {
  elevation: 8, // Android stacking
  shadowColor: colors.shadow,
  shadowOpacity: 0.15,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
} as const;
