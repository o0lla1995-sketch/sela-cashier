/**
 * theme.ts — v2.0: هوية «سيلّا كاشير» = هوية تطبيق نقطة البيع حرفياً.
 * ─────────────────────────────────────────────────────────────────
 * نظام الثيم الديناميكي الكامل (وضع نهاري/ليلي/تلقائي) المنقول بنفس
 * قيم ألوان تطبيق نقطة البيع أندرويد — نفس الطبقات الأربع، نفس
 * البارامترات الدلالية، نفس خط تجوال — فيبدو التطبيقان تطبيقاً
 * واحداً متكاملاً (طلب التاجر حرفياً).
 */
import React, {useMemo} from 'react';
import {Appearance, StyleSheet} from 'react-native';
import {create} from 'zustand';
import {storageGet, storageSet} from './native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Complete semantic palette — identical key set in both modes. */
export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHi: string;
  border: string;
  borderSoft: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentSofter: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  text: string;
  textDim: string;
  textFaint: string;
  onAccent: string;
  overlay: string;
  hairline: string;
}

const DARK: Palette = {
  bg: '#0E0E12',
  surface: '#17171D',
  surfaceAlt: '#1F1F27',
  surfaceHi: '#26262F',
  border: '#2A2A33',
  borderSoft: '#22222B',
  accent: '#F97316',
  accentDark: '#C2410C',
  accentSoft: 'rgba(249, 115, 22, 0.16)',
  accentSofter: 'rgba(249, 115, 22, 0.08)',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.15)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  warning: '#FACC15',
  warningSoft: 'rgba(250, 204, 21, 0.15)',
  info: '#38BDF8',
  infoSoft: 'rgba(56, 189, 248, 0.14)',
  text: '#F4F4F5',
  textDim: '#A1A1AA',
  textFaint: '#71717A',
  onAccent: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.55)',
  hairline: '#2A2A33',
};

const LIGHT: Palette = {
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F1F4',
  surfaceHi: '#E9E9EE',
  border: '#DDDDE4',
  borderSoft: '#E8E8EE',
  accent: '#F97316',
  accentDark: '#C2410C',
  accentSoft: 'rgba(249, 115, 22, 0.13)',
  accentSofter: 'rgba(249, 115, 22, 0.07)',
  success: '#15A34A',
  successSoft: 'rgba(21, 163, 74, 0.13)',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.12)',
  warning: '#B45309',
  warningSoft: 'rgba(180, 83, 9, 0.13)',
  info: '#0369A1',
  infoSoft: 'rgba(3, 105, 161, 0.12)',
  text: '#17171D',
  textDim: '#55555F',
  textFaint: '#8B8B96',
  onAccent: '#FFFFFF',
  overlay: 'rgba(20, 20, 26, 0.35)',
  hairline: '#E4E4EA',
};

export function paletteFor(mode: ResolvedTheme): Palette {
  return mode === 'light' ? LIGHT : DARK;
}

function systemTheme(): ResolvedTheme {
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' ? 'light' : 'dark';
}

// ── مخزن الثيم (zustand) ──────────────────────────────────────────
interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
  syncSystem: () => void;
}

const THEME_KEY = 'themeMode';

function readStoredMode(): ThemeMode {
  const stored = 'dark'; // افتراضي داكن — هوية نقطة البيع.
  // القراءة من التخزين الأصلي غير متزامنة؛ تُستوفى في restore().
  return stored as ThemeMode;
}

const initialMode: ThemeMode = readStoredMode();
const initialResolved =
  initialMode === 'system' ? systemTheme() : initialMode;

export const useThemeStore = create<ThemeState>(set => ({
  mode: initialMode,
  resolved: initialResolved,
  palette: paletteFor(initialResolved),
  setMode: mode => {
    const resolved = mode === 'system' ? systemTheme() : mode;
    void storageSet(THEME_KEY, mode);
    set({mode, resolved, palette: paletteFor(resolved)});
  },
  syncSystem: () => {
    const {mode} = useThemeStore.getState();
    if (mode !== 'system') {
      return;
    }
    const resolved = systemTheme();
    if (resolved !== useThemeStore.getState().resolved) {
      set({resolved, palette: paletteFor(resolved)});
    }
  },
}));

/** استعادة الوضع المحفوظ عند الإقلاع (بعد جاهزية الجسر الأصلي). */
export async function restoreThemeMode(): Promise<void> {
  const stored = await storageGet(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    const resolved = stored === 'system' ? systemTheme() : stored;
    useThemeStore.setState({mode: stored, resolved, palette: paletteFor(resolved)});
  }
}

/** Hook كل مكون يقرأ منه الألوان — يعيد الرسم عند تبديل الوضع. */
export function useThemeColors(): Palette {
  return useThemeStore(state => state.palette);
}

/** الوصول للوحة خارج React (الإشعارات، البطاقات). */
export function getPalette(): Palette {
  return useThemeStore.getState().palette;
}

/** خط تجوال — نفس ملفات نقطة البيع. */
export const fonts = {
  regular: 'Tajawal-Regular',
  medium: 'Tajawal-Medium',
  bold: 'Tajawal-Bold',
  black: 'Tajawal-Black',
} as const;

export const typography = {
  display: 34,
  title: 24,
  heading: 18,
  body: 15.5,
  caption: 13.5,
  small: 12,
  micro: 10.5,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * makeStyles — مصنع صغير تبني به الشاشات أنماطاً themed تُعاد
 * عند تبديل الوضع (نفس أسلوب نقطة البيع حرفياً).
 */
export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(factory: (c: Palette) => T): () => T {
  const cache = new Map<ResolvedTheme, T>();
  return () => {
    const palette = useThemeColors();
    return useMemo(() => {
      const hit = cache.get(palette === LIGHT ? 'light' : 'dark');
      if (hit != null) {
        return hit;
      }
      const built = StyleSheet.create(factory(palette));
      cache.set(palette === LIGHT ? 'light' : 'dark', built);
      return built;
    }, [palette]);
  };
}

// ── أدوات التنسيق (نفس سلوك نقطة البيع) ──────────────────────────
export function formatMoney(value: number): string {
  return `${(Math.round(value * 100) / 100).toFixed(2)} ₪`;
}

export function formatQty(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}
