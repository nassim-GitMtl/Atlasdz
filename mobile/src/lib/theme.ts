// Approved Atlas DZ blue design (2026-11-15), shared with the websites.
// Older names (cream, olive, coral, soft) stay as aliases used across the screens.
export const colors = {
  surface: '#f5f7fa',
  cream: '#f5f7fa',
  card: '#ffffff',
  ink: '#171c24',
  muted: '#5b6779',
  primary: '#2957f5',
  olive: '#2957f5',
  primaryDark: '#1e40c8',
  coral: '#2957f5',
  line: '#e3e7ef',
  soft: '#eef2ff',
  danger: '#b42318',
  dangerSoft: '#fdecec',
  success: '#146c2e',
  successSoft: '#e6f4ea',
  warning: '#8a4b00',
  warningSoft: '#fff4e5',
} as const;

export const radius = 10;
export const gap = 16;

/** Bottom tab bar tall enough for icon + label, above the phone's gesture/home area. */
export const tabBarStyle = (bottomInset: number) => ({
  backgroundColor: colors.card,
  height: 60 + bottomInset,
  paddingTop: 6,
  paddingBottom: 6 + bottomInset,
});
