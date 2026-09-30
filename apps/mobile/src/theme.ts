/** GhepGo brand tokens shared by every screen (mirrors apps/web/src/app/globals.css). */
export const colors = {
  brand: "#0b8c75",
  brandDark: "#0b705f",
  brandLight: "#effcf8",
  brandBorder: "#aeeedb",
  ink: "#171b2e",
  inkMuted: "#667092",
  inkSubtle: "#8d97b0",
  border: "#d9dde8",
  surface: "#ffffff",
  background: "#f6f7fb",
  success: "#16a34a",
  successBg: "#dcfce7",
  warning: "#d97706",
  warningBg: "#fef3c7",
  danger: "#dc2626",
  accent: "#f59e0b",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 } as const;

export const shadow = {
  card: { shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
} as const;
