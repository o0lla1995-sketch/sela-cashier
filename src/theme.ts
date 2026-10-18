/**
 * theme.ts — هوية سيلّا كاشير: نفس عائلة ألوان سيلا (فحمي + برتقالي)
 * بخط تجوال على كل النصوص.
 */
import React from 'react';
import {StyleSheet, useColorScheme} from 'react-native';

export const palette = {
  bg: '#0E0E12',
  surface: '#17171D',
  surfaceHi: '#26262F',
  border: '#2E2E38',
  text: '#F2F2F5',
  textDim: '#9B9BA6',
  textFaint: '#6A6A75',
  accent: '#F97316',
  accentSoft: 'rgba(249,115,22,0.15)',
  onAccent: '#FFFFFF',
  success: '#22C55E',
  successSoft: 'rgba(34,197,94,0.15)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.15)',
  warning: '#EAB308',
};

export const fonts = {
  regular: 'Tajawal-Regular',
  medium: 'Tajawal-Medium',
  bold: 'Tajawal-Bold',
  black: 'Tajawal-Black',
} as const;

export const typography = {
  title: 22,
  heading: 17,
  body: 15,
  small: 12.5,
  micro: 10.5,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export function useTheme() {
  // نمط داكن دائماً — هوية نقطة البيع.
  React.useMemo(() => StyleSheet.create({}), []);
  return {
    c: palette,
    t: typography,
    s: spacing,
    f: fonts,
  };
}

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(2)} ₪`;
}

export function formatQty(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 1000) / 1000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, '');
}

export function formatDateTime(iso: string): string {
  if (!iso || iso.length < 16) {
    return iso ?? '';
  }
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function formatMinor(minor: number): string {
  return formatMoney(minor / 100);
}
