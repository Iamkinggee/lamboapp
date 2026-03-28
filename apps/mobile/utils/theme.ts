// ──────────────────────────────────────────────
// apps/mobile/utils/theme.ts
// Design tokens — matches blueprint design system
// ──────────────────────────────────────────────
export const Colors = {
  bg:    '#0A0A1A',
  surface:       '#1A1A2E',
  surfaceHigh:   '#242440',
  accent:    '#00D4FF',
  accentPurple:  '#7B2FBE',
  green:           '#00C896',
  red:          '#FF4757',
  caution:       '#FFD700',
  text:   '#FFFFFF',
  textSecondary: '#AABBCC',
  muted:     '#556677',
  border:        '#2A2A4A',
  error:         '#FF4757',
  success:       '#00C896',
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const radius = {
  sm:   6,
  md:  12,
  lg:  16,
  full: 999,
} as const;

export const font = {
  size: {
    xs:  11,
    sm:  13,
    md:  15,
    lg:  17,
    xl:  20,
    xxl: 26,
    xxxl: 32,
  },
  weight: {
    normal:   '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
} as const;

/** Returns color based on confidence score */
export function confidenceColor(score: number): string {
  if (score >= 80) return Colors.green;
  if (score >= 60) return Colors.caution;
  return Colors.red;
}