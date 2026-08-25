// contexts/ThemeContext.tsx - 外観設定（Scheme: Light/Dark、Accent Color）
import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { authenticatedFetch, getApiUrl } from '../utils/api';

// アカウントごとに最後に取得したテーマ設定を端末側にもキャッシュしておき、
// 次回起動時はAPI応答を待たずにこのキャッシュ値で即描画する（サーバー取得完了までの
// デフォルト配色（Light/Black）へのちらつきを防ぐため）
const THEME_CACHE_KEY_PREFIX = '@theme_settings_cache:';

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
  // colors.accentで塗った面の上に置く文字・アイコンの色（Lightは白文字、Darkはアクセントを
  // 薄い色にする分、濃い文字にしないと読めなくなるため）
  accentContrastText: string;
  // ヘッダー・フッター（chrome）用のトークン。Lightでは白背景+濃色文字、Darkでは
  // Lightのフッターで使っていた「濃色アクセント背景+白文字」をヘッダー・フッター共通にする
  chrome: string;
  chromeText: string;
  chromeMuted: string;
  chromeBorder: string;
};

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

// Lightは「白背景+ビビッドなアクセント」、Darkは背景をアクセントカラーで沈めた濃色にし、
// アクセント自体は薄い色にすることでLightと明暗関係を反転させている
type AccentSchemePalette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentDeep: string;
  accentContrastText: string;
};

const LIGHT_INK = '#201B2C';
const LIGHT_MUTED = '#6B6675';
const LIGHT_BORDER = '#E8E3F1';
const LIGHT_WHITE = '#FFFFFF';

const DARK_INK = '#F4F4F5';
const DARK_MUTED = '#A7A7AE';
const DARK_BORDER = 'rgba(255,255,255,0.24)';
const DARK_CONTRAST_TEXT = '#14141A';

const PALETTES: Record<AccentKey, { light: AccentSchemePalette; dark: AccentSchemePalette }> = {
  // Blackは真っ黒ではなく、ほぼ黒の色にする
  black: {
    light: {
      background: LIGHT_WHITE, surface: LIGHT_WHITE, surfaceAlt: '#F7F6FA', border: LIGHT_BORDER,
      accent: '#18181B', accentDark: '#000000', accentSoft: '#F0F0F2', accentDeep: '#000000',
      accentContrastText: LIGHT_WHITE,
    },
    dark: {
      background: '#0A0A0B', surface: '#19191C', surfaceAlt: '#000000', border: DARK_BORDER,
      accent: '#FFFFFF', accentDark: '#FFFFFF', accentSoft: 'rgba(255,255,255,0.10)', accentDeep: '#000000',
      accentContrastText: DARK_CONTRAST_TEXT,
    },
  },
  blue: {
    light: {
      background: LIGHT_WHITE, surface: LIGHT_WHITE, surfaceAlt: '#EFF6FF', border: LIGHT_BORDER,
      accent: '#2563EB', accentDark: '#1D4ED8', accentSoft: '#DBEAFE', accentDeep: '#1E3A8A',
      accentContrastText: LIGHT_WHITE,
    },
    dark: {
      background: '#0A121F', surface: '#122036', surfaceAlt: '#0A121F', border: DARK_BORDER,
      accent: '#7FB1FD', accentDark: '#A9CBFC', accentSoft: 'rgba(127,177,253,0.14)', accentDeep: '#000000',
      accentContrastText: DARK_CONTRAST_TEXT,
    },
  },
  green: {
    light: {
      background: LIGHT_WHITE, surface: LIGHT_WHITE, surfaceAlt: '#F0FDF4', border: LIGHT_BORDER,
      accent: '#16A34A', accentDark: '#15803D', accentSoft: '#DCFCE7', accentDeep: '#14532D',
      accentContrastText: LIGHT_WHITE,
    },
    dark: {
      background: '#08150F', surface: '#0F2419', surfaceAlt: '#08150F', border: DARK_BORDER,
      accent: '#63E094', accentDark: '#8FEFB2', accentSoft: 'rgba(99,224,148,0.14)', accentDeep: '#000000',
      accentContrastText: DARK_CONTRAST_TEXT,
    },
  },
  orange: {
    light: {
      background: LIGHT_WHITE, surface: LIGHT_WHITE, surfaceAlt: '#FFF7ED', border: LIGHT_BORDER,
      accent: '#EA580C', accentDark: '#C2410C', accentSoft: '#FFEDD5', accentDeep: '#7C2D12',
      accentContrastText: LIGHT_WHITE,
    },
    dark: {
      background: '#190F07', surface: '#291A0D', surfaceAlt: '#190F07', border: DARK_BORDER,
      accent: '#FDA860', accentDark: '#FDC08C', accentSoft: 'rgba(253,168,96,0.14)', accentDeep: '#000000',
      accentContrastText: DARK_CONTRAST_TEXT,
    },
  },
  pink: {
    light: {
      background: LIGHT_WHITE, surface: LIGHT_WHITE, surfaceAlt: '#FDF2F8', border: LIGHT_BORDER,
      accent: '#DB2777', accentDark: '#BE185D', accentSoft: '#FCE7F3', accentDeep: '#831843',
      accentContrastText: LIGHT_WHITE,
    },
    dark: {
      background: '#190A12', surface: '#2A1220', surfaceAlt: '#190A12', border: DARK_BORDER,
      accent: '#F598C4', accentDark: '#F8BAD9', accentSoft: 'rgba(245,152,196,0.14)', accentDeep: '#000000',
      accentContrastText: DARK_CONTRAST_TEXT,
    },
  },
  purple: {
    // 従来のブランドカラーをそのままPurpleプリセットとして移行
    light: {
      background: LIGHT_WHITE, surface: LIGHT_WHITE, surfaceAlt: '#F5F3FF', border: LIGHT_BORDER,
      accent: '#7C3AED', accentDark: '#5B21B6', accentSoft: '#EDE9FE', accentDeep: '#2E1065',
      accentContrastText: LIGHT_WHITE,
    },
    dark: {
      background: '#130A22', surface: '#201136', surfaceAlt: '#130A22', border: DARK_BORDER,
      accent: '#B89DF8', accentDark: '#D0C2FA', accentSoft: 'rgba(184,157,248,0.14)', accentDeep: '#000000',
      accentContrastText: DARK_CONTRAST_TEXT,
    },
  },
};

export const DEFAULT_SCHEME: SchemeKey = 'light';
export const DEFAULT_ACCENT: AccentKey = 'black';

function resolveColors(scheme: SchemeKey, accent: AccentKey): ThemeColors {
  const palette = PALETTES[accent][scheme];
  const ink = scheme === 'dark' ? DARK_INK : LIGHT_INK;
  const muted = scheme === 'dark' ? DARK_MUTED : LIGHT_MUTED;
  // Darkのヘッダー・フッターは、LightパレットのaccentDeep（濃色アクセント）を流用する
  const lightAccentDeep = PALETTES[accent].light.accentDeep;
  const chrome = scheme === 'dark' ? lightAccentDeep : palette.background;
  const chromeText = scheme === 'dark' ? '#FFFFFF' : ink;
  const chromeMuted = scheme === 'dark' ? 'rgba(255,255,255,0.72)' : muted;
  const chromeBorder = scheme === 'dark' ? DARK_BORDER : LIGHT_BORDER;
  return { ...palette, ink, muted, chrome, chromeText, chromeMuted, chromeBorder };
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
  const { isAuthenticated, email } = useAuth();
  // 未ログイン（共有ページ・ログイン前ページ）は、閲覧者の端末側の外観設定に追従する
  const systemScheme = useColorScheme();
  const [scheme, setSchemeState] = useState<SchemeKey>(DEFAULT_SCHEME);
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);
  const [loading, setLoading] = useState(false);

  // サーバーへの問い合わせが完了する前に、端末に保存済みの前回値があれば先に反映する
  useEffect(() => {
    if (!isAuthenticated || !email) return;
    AsyncStorage.getItem(`${THEME_CACHE_KEY_PREFIX}${email}`)
      .then((cached) => {
        if (!cached) return;
        const parsed = JSON.parse(cached) as { scheme?: SchemeKey; accent?: AccentKey };
        if (parsed.scheme) setSchemeState(parsed.scheme);
        if (parsed.accent) setAccentState(parsed.accent);
      })
      .catch(() => undefined);
  }, [isAuthenticated, email]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSchemeState(systemScheme === 'dark' ? 'dark' : 'light');
      setAccentState(DEFAULT_ACCENT);
      return;
    }
    setLoading(true);
    authenticatedFetch(getApiUrl('/theme-settings'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.scheme) setSchemeState(data.scheme);
        if (data?.accent) setAccentState(data.accent);
        if (email && data && (data.scheme || data.accent)) {
          AsyncStorage.setItem(
            `${THEME_CACHE_KEY_PREFIX}${email}`,
            JSON.stringify({ scheme: data.scheme, accent: data.accent })
          ).catch(() => undefined);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [isAuthenticated, systemScheme, email]);

  const persist = useCallback(async (next: { scheme: SchemeKey; accent: AccentKey }) => {
    const res = await authenticatedFetch(getApiUrl('/theme-settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error('外観設定の更新に失敗しました');
    if (email) {
      AsyncStorage.setItem(`${THEME_CACHE_KEY_PREFIX}${email}`, JSON.stringify(next)).catch(() => undefined);
    }
  }, [email]);

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
