import { useMemo } from 'react';
import { useThemeStore } from '../stores/themeStore';

// ── LIGHT — warm cream + deep forest green ─────────────────────────────────────
const LIGHT = {
  bg:              '#F4EFE3',
  surface:         '#FFFFFF',
  card:            '#FFFFFF',
  inputBg:         '#EFE9DA',
  text:            '#161A17',
  textMuted:       '#666F67',
  textSubtle:      '#9A9E93',
  textPlaceholder: '#B3AD9C',
  border:          '#E4DDC9',
  borderLight:     '#EDE7D8',
  tabBg:           '#FFFFFF',
  tabActive:       '#1B3A2C',
  tabInactive:     '#9A9E93',
  navBorder:       '#EDE7D8',
  primary:         '#1B3A2C',
  primaryLight:    '#2D7A4F',
  primaryBg:       '#E7F0EA',
  accent:          '#C9A961',
  accentBg:        '#FBF5E7',
};

// ── DARK — deep forest black + gold accent ─────────────────────────────────────
const DARK = {
  bg:              '#0D1F17',
  surface:         '#123026',
  card:            '#14332A',
  inputBg:         '#1A3B2E',
  text:            '#F0EAD9',
  textMuted:       '#8FA396',
  textSubtle:      '#5C6E63',
  textPlaceholder: '#4A5C51',
  border:          '#1E4536',
  borderLight:     '#193629',
  tabBg:           '#0D1F17',
  tabActive:       '#C9A961',
  tabInactive:     '#5C6E63',
  navBorder:       '#193629',
  primary:         '#2D7A4F',
  primaryLight:    '#4CAF7A',
  primaryBg:       '#152E22',
  accent:          '#C9A961',
  accentBg:        '#1F3A2C',
};

// Shared static colors
const STATIC = {
  white:   '#FFFFFF',
  black:   '#000000',
  error:   '#D64545',
  like:    '#FF3B5C',
  gold:    '#C9A961',
  success: '#1B3A2C',
};

export type AppTheme = typeof LIGHT & typeof STATIC & { isDark: boolean };

export function useTheme(): AppTheme {
  const { isDark } = useThemeStore();
  return useMemo(() => ({
    isDark,
    ...(isDark ? DARK : LIGHT),
    ...STATIC,
  }), [isDark]);
}

export function useIsDark(): boolean {
  return useThemeStore(s => s.isDark);
}
