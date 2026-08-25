// contexts/ThemeContext.tsx - 外観設定（Scheme: Light/Dark、Accent Color）
import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { authenticatedFetch, getApiUrl } from '../utils/api';

export type SchemeKey = 'light' | 'dark';
export type AccentKey = 'black' | 'blue' | 'green' | 'orange' | 'pink' | 'purple';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentDeep: string;
};

type AccentPalette = Pick<ThemeColors, 'accent' | 'accentDark' | 'accentSoft' | 'accentDeep'>;
type SchemeTokens = Pick<ThemeColors, 'background' | 'surface' | 'surfaceAlt' | 'ink' | 'muted' | 'border'>;

export const ACCENT_OPTIONS: { key: AccentKey; label: string }[] = [
  { key: 'black', label: 'Black' },
  { key: 'blue', label: 'Blue' },
  { key: 'green', label: 'Green' },
  { key: 'orange', label: 'Orange' },
  { key: 'pink', label: 'Pink' },
  { key: 'purple', label: 'Purple' },
];

export const SCHEME_OPTIONS: { key: SchemeKey; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

// Blackは真っ黒ではなく、ほぼ黒の色にする
const ACCENT_PALETTES: Record<AccentKey, AccentPalette> = {
  black: { accent: '#18181B', accentDark: '#000000', accentSoft: '#F0F0F2', accentDeep: '#000000' },
  blue: { accent: '#2563EB', accentDark: '#1D4ED8', accentSoft: '#DBEAFE', accentDeep: '#1E3A8A' },
  green: { accent: '#16A34A', accentDark: '#15803D', accentSoft: '#DCFCE7', accentDeep: '#14532D' },
  orange: { accent: '#EA580C', accentDark: '#C2410C', accentSoft: '#FFEDD5', accentDeep: '#7C2D12' },
  pink: { accent: '#DB2777', accentDark: '#BE185D', accentSoft: '#FCE7F3', accentDeep: '#831843' },
  // 従来のブランドカラーをそのままPurpleプリセットとして移行
  purple: { accent: '#7C3AED', accentDark: '#5B21B6', accentSoft: '#EDE9FE', accentDeep: '#2E1065' },
};

const SCHEME_TOKENS: Record<SchemeKey, SchemeTokens> = {
  light: { background: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#F7F6FA', ink: '#201B2C', muted: '#6B6675', border: '#E8E3F1' },
  dark: { background: '#18181B', surface: '#242428', surfaceAlt: '#1F1F23', ink: '#F4F4F5', muted: '#A1A1AA', border: '#3A3A40' },
};

export const DEFAULT_SCHEME: SchemeKey = 'light';
export const DEFAULT_ACCENT: AccentKey = 'black';

function resolveColors(scheme: SchemeKey, accent: AccentKey): ThemeColors {
  return { ...SCHEME_TOKENS[scheme], ...ACCENT_PALETTES[accent] };
}

interface ThemeContextType {
  scheme: SchemeKey;
  accent: AccentKey;
  colors: ThemeColors;
  loading: boolean;
  setScheme: (scheme: SchemeKey) => Promise<void>;
  setAccent: (accent: AccentKey) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [scheme, setSchemeState] = useState<SchemeKey>(DEFAULT_SCHEME);
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSchemeState(DEFAULT_SCHEME);
      setAccentState(DEFAULT_ACCENT);
      return;
    }
    setLoading(true);
    authenticatedFetch(getApiUrl('/theme-settings'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.scheme) setSchemeState(data.scheme);
        if (data?.accent) setAccentState(data.accent);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const persist = useCallback(async (next: { scheme: SchemeKey; accent: AccentKey }) => {
    const res = await authenticatedFetch(getApiUrl('/theme-settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error('外観設定の更新に失敗しました');
  }, []);

  const setScheme = useCallback(
    async (next: SchemeKey) => {
      const previous = scheme;
      setSchemeState(next);
      try {
        await persist({ scheme: next, accent });
      } catch (e) {
        setSchemeState(previous);
        throw e;
      }
    },
    [scheme, accent, persist]
  );

  const setAccent = useCallback(
    async (next: AccentKey) => {
      const previous = accent;
      setAccentState(next);
      try {
        await persist({ scheme, accent: next });
      } catch (e) {
        setAccentState(previous);
        throw e;
      }
    },
    [scheme, accent, persist]
  );

  const value: ThemeContextType = {
    scheme,
    accent,
    colors: resolveColors(scheme, accent),
    loading,
    setScheme,
    setAccent,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
