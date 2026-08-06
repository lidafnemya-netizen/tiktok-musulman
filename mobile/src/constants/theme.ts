import { Dimensions, Platform } from 'react-native';

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── BRAND COLORS ─────────────────────────────────────────────────────────────
// Reference DA: warm cream + deep forest green (light) / deep forest black + gold (dark)
export const COLORS = {
  // Primary — deep forest green
  primary: '#1B3A2C',
  primaryLight: '#2D7A4F',
  primaryDark: '#122A20',
  primaryBg: '#E7F0EA',
  primaryBgDark: '#152E22',

  // Accent — warm gold (dark-mode hero accent + highlights)
  gold: '#C9A961',
  goldLight: '#DDC188',
  goldDark: '#A6863F',
  goldBg: '#FBF5E7',

  // Backgrounds (light mode) — warm cream, not neutral grey
  bg: '#F4EFE3',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  inputBg: '#EFE9DA',

  // Backgrounds (dark mode) — deep forest, not true black
  bgDark: '#0D1F17',
  surfaceDark: '#123026',
  cardDark: '#14332A',
  inputBgDark: '#1A3B2E',

  // Text (light mode)
  text: '#161A17',
  textMuted: '#666F67',
  textSubtle: '#9A9E93',
  textPlaceholder: '#B3AD9C',

  // Text (dark mode)
  textDark: '#F0EAD9',
  textMutedDark: '#8FA396',

  // Borders
  border: '#E4DDC9',
  borderDark: '#1E4536',
  borderLight: '#EDE7D8',

  // Semantic
  like: '#E0524F',
  likeBg: '#FCEEED',
  success: '#1B3A2C',
  warning: '#C9A961',
  error: '#D64545',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(11,22,17,0.5)',
  overlayLight: 'rgba(11,22,17,0.15)',
  transparent: 'transparent',

  // Tab bar
  tabActive: '#1B3A2C',
  tabInactive: '#9A9E93',
};

// ─── SPACING ──────────────────────────────────────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ─── BORDER RADIUS ────────────────────────────────────────────────────────────
export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
export const FONT = {
  family: Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif',
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 28,
    display: 34,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};

// ─── SHADOWS ──────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    shadowColor: '#0B1611',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#0B1611',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0B1611',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  green: {
    shadowColor: '#1B3A2C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  gold: {
    shadowColor: '#C9A961',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
};

// ─── API ──────────────────────────────────────────────────────────────────────
export const API_BASE_URL = 'https://tiktok-musulman-backend.onrender.com/api';
export const WS_URL = 'https://tiktok-musulman-backend.onrender.com';
