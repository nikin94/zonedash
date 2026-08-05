/**
 * ZoneDash dark theme — the single source for every color in the app.
 * Components must pull from here; no inline hex values in styles.
 */
export const colors = {
  background: "#0a0a0a", // app + button/dropdown fill
  surface: "#18181b", // pressed states, active section pill, prompted dot
  surfaceAlt: "#27272a", // wheel selection band
  border: "#3f3f46",
  text: "#fafafa",
  textSecondary: "#a1a1aa", // labels, headings
  textMuted: "#71717a", // hints, inactive chips, idle indicator
  accent: "#818cf8", // selection (path steps, open pill border)
  accentSurface: "#1e1b4b", // active pill fill
  accentText: "#e0e7ff",
  success: "#34d399", // bound dots, done text, connected indicator
  warning: "#fbbf24", // awaiting-confirm dot
  danger: "#f87171", // errors, error indicator
  dangerBorder: "#7f1d1d", // destructive confirm button
  dim: "#52525b", // available court dots
  glow: "#fff", // floating-chrome shadow
} as const;

/** hex (#rrggbb) → rgba string, for styles that need an explicit alpha. */
export const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Soft white glow shared by floating chrome (wheel dropdown, confirm card). */
export const glowShadow = {
  elevation: 8, // Android stacking
  shadowColor: colors.glow,
  shadowOpacity: 0.18,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 0 },
} as const;
