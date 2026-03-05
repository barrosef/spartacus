/**
 * Design tokens extracted from the Spartacus Replit prototype.
 * HSL values converted to hex for React Native compatibility.
 */

export const colors = {
  // App backgrounds
  outerBg: "#050505",        // screen outer bg (web only context)
  background: "#0B0D12",     // HSL 223 24% 6% — main bg
  card: "#1A1C26",           // HSL 232 12% 13% — card / secondary
  border: "#2A2D3E",         // HSL 232 12% 20% — border
  muted: "#2A2D3E",          // HSL 232 12% 20%
  mutedForeground: "#999999",// HSL 0 0% 60%

  // Primary gold
  primary: "#C6A34E",        // HSL 42.5 53.4% 54.1%
  primaryForeground: "#0B0D12",
  primaryBorder: "#A88540",  // slightly darker for borders
  primaryMuted: "rgba(198,163,78,0.1)",
  primaryShadow: "rgba(198,163,78,0.2)",
  primaryGlow: "rgba(198,163,78,0.15)",

  // Text
  foreground: "#E6E6E6",     // HSL 0 0% 90%
  foregroundMuted: "#999999",

  // Status
  success: "#4CAF50",
  error: "#EF4444",
  warning: "#F59E0B",

  // Extras
  phoneBorder: "#1E1F26",
  white: "#FFFFFF",
  transparent: "transparent",
} as const;

export const typography = {
  fontHeading: "Montserrat_700Bold",
  fontHeadingSemi: "Montserrat_600SemiBold",
  fontBody: "Inter_400Regular",
  fontBodyMedium: "Inter_500Medium",
  fontBodySemiBold: "Inter_600SemiBold",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const inputHeight = 56;  // h-14 = 3.5rem = 56px
export const buttonHeight = 56;
