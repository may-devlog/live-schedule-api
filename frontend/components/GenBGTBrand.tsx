import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { AccountMenu } from './AccountMenu';
import { NotificationMenu } from './NotificationMenu';
import { fetchProfile } from '../utils/profile-request';

// Web版ヘッダーの代わりにネイティブで表示する、Safe Area分の余白のみのスペーサー
function NativeTopSpacer() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return <View style={{ height: insets.top, backgroundColor: colors.chrome }} />;
}

// ログイン中のネイティブ画面向け: Safe Area余白+検索・通知・アカウントの3アイコン（Web版のスマホ表示と同じ構成）
function NativeAppHeaderBar({ onDisplayNameChange }: { onDisplayNameChange?: (value: string | null) => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email } = useAuth();
  const { colors } = useTheme();
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileShareId, setProfileShareId] = useState<string | null>(null);
  const [accountVisible, setAccountVisible] = useState(false);
  const accountLabel = displayName || profileShareId || email?.split('@')[0] || 'ユーザー';

  useEffect(() => {
    fetchProfile(true)
      .then((profile) => {
        setAvatarDataUrl(profile?.avatar_data_url ?? null);
        setDisplayName(profile?.display_name ?? null);
        setProfileShareId(profile?.share_id ?? null);
      })
      .catch(() => { setAvatarDataUrl(null); setDisplayName(null); setProfileShareId(null); });
  }, []);

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.chrome, borderBottomWidth: 1, borderBottomColor: colors.chromeBorder }}>
      <View style={styles.nativeHeaderBar}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.accentSoft }]} onPress={() => router.push('/find-user')} accessibilityLabel="共有ページを検索">
          <Ionicons name="search-outline" size={20} color={colors.accentDark} />
        </TouchableOpacity>
        <NotificationMenu />
        <TouchableOpacity style={styles.accountButton} onPress={() => setAccountVisible(true)} accessibilityLabel="アカウントメニューを開く">
          <View style={[styles.accountAvatar, { backgroundColor: colors.accentSoft }]}>{avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.accountAvatarImage} /> : <Text style={[styles.accountAvatarText, { color: colors.accentDark }]}>{accountLabel.slice(0, 1).toUpperCase()}</Text>}</View>
          <Ionicons name="chevron-down" size={16} color={colors.chromeMuted} />
        </TouchableOpacity>
      </View>

      <AccountMenu
        visible={accountVisible}
        onClose={() => setAccountVisible(false)}
        avatarDataUrl={avatarDataUrl}
        onAvatarChange={setAvatarDataUrl}
        displayName={displayName}
        onDisplayNameChange={(value) => { setDisplayName(value); onDisplayNameChange?.(value); }}
      />
    </View>
  );
}

export const HEADER_CONTENT_MAX_WIDTH = 1320;

// ロゴマークの配色は固定（暗い面では白グリフ／明るい面では黒グリフ）で、
// アクセントカラー設定とは独立している。背景は持たせず常に透過
const BRAND_MARK_BLACK = require('../assets/images/brandmark-black.png');
const BRAND_MARK_WHITE = require('../assets/images/brandmark-white.png');

// light未指定時はscheme（Light/Dark）から自動判定する。フッターの非compact時のように
// scheme に関わらず常に暗い面に乗る場合だけ、呼び出し側で明示的に light を渡す
export function BrandMark({ size = 42, light }: { size?: number; light?: boolean }) {
  const { scheme } = useTheme();
  const resolvedLight = light ?? scheme === 'dark';
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <Image
        source={resolvedLight ? BRAND_MARK_WHITE : BRAND_MARK_BLACK}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

// header/footer（chrome面）専用。chrome面の配色に合わせて自動的に読める色になる
export function BrandWordmark({ light, compact = false }: { light?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wordmarkRow}>
      <BrandMark size={compact ? 34 : 42} light={light} />
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact, { color: colors.chromeText }]}>GenBGT</Text>
    </View>
  );
}

export function PublicHeader({ active = 'archive', homePath = '/', archivePath, showNav = true }: { active?: 'home' | 'archive' | 'none'; homePath?: string; archivePath?: string; showNav?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  if (Platform.OS !== 'web') return <NativeTopSpacer />;

  return (
    <View style={[styles.header, { backgroundColor: colors.chrome, borderBottomColor: colors.chromeBorder }]}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push(homePath)} activeOpacity={0.8}>
          <BrandWordmark compact={narrow} />
        </TouchableOpacity>
        {!narrow && showNav && (
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => router.push(homePath)}>
              <Text style={[styles.navText, { color: colors.chromeText }, active === 'home' && { color: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accent }]}>HOME</Text>
            </TouchableOpacity>
            {archivePath ? (
              <TouchableOpacity onPress={() => router.push(archivePath)}>
                <Text style={[styles.navText, { color: colors.chromeText }, active === 'archive' && { color: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accent }]}>ARCHIVE</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.navText, { color: colors.chromeText }, active === 'archive' && { color: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accent }]}>ARCHIVE</Text>
            )}
          </View>
        )}
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.accent }]} onPress={() => router.push('/login')}>
            <Text style={[styles.outlineButtonText, { color: colors.accent }]}>ログイン</Text>
          </TouchableOpacity>
          {!narrow && (
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={() => router.push('/register')}>
              <Text style={[styles.primaryButtonText, { color: colors.accentContrastText }]}>GenBGTをはじめる</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export function AuthHeader() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 640;

  if (Platform.OS !== 'web') return <NativeTopSpacer />;

  return (
    <View style={[styles.header, { backgroundColor: colors.chrome, borderBottomColor: colors.chromeBorder }]}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.8}>
          <BrandWordmark compact={narrow} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {!narrow && (
            <TouchableOpacity style={styles.textButton} onPress={() => router.push('/find-user')}>
              <Text style={[styles.textButtonText, { color: colors.accent }]}>共有ページを見る</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.accent }]} onPress={() => router.push('/register')}>
            <Text style={[styles.outlineButtonText, { color: colors.accent }]}>新規登録</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function AppHeader({ active = 'archive', onDisplayNameChange }: { active?: 'home' | 'archive'; onDisplayNameChange?: (value: string | null) => void }) {
  const router = useRouter();
  const { email } = useAuth();
  const { colors } = useTheme();
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileShareId, setProfileShareId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const accountLabel = displayName || profileShareId || email?.split('@')[0] || 'ユーザー';
  useEffect(() => {
    fetchProfile(true)
      .then((profile) => {
        setAvatarDataUrl(profile?.avatar_data_url ?? null);
        setDisplayName(profile?.display_name ?? null);
        setProfileShareId(profile?.share_id ?? null);
      })
      .catch(() => { setAvatarDataUrl(null); setDisplayName(null); setProfileShareId(null); });
  }, []);

  if (Platform.OS !== 'web') return <NativeAppHeaderBar onDisplayNameChange={onDisplayNameChange} />;

  return (
    <View style={[styles.header, { backgroundColor: colors.chrome, borderBottomColor: colors.chromeBorder }]}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.8}><BrandWordmark compact={narrow} /></TouchableOpacity>
        {!narrow && <View style={styles.nav}>
          <TouchableOpacity onPress={() => router.push('/')}>
            <Text style={[styles.navText, { color: colors.chromeText }, active === 'home' && { color: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accent }]}>HOME</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/year/${new Date().getFullYear()}`)}>
            <Text style={[styles.navText, { color: colors.chromeText }, active === 'archive' && { color: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accent }]}>ARCHIVE</Text>
          </TouchableOpacity>
        </View>}
        <View style={styles.appHeaderActions}>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.accentSoft }]} onPress={() => router.push('/find-user')} accessibilityLabel="共有ページを検索">
            <Ionicons name="search-outline" size={21} color={colors.accentDark} />
          </TouchableOpacity>
          <NotificationMenu />
          <TouchableOpacity style={styles.accountButton} onPress={() => setMenuVisible(true)}>
            <View style={[styles.accountAvatar, { backgroundColor: colors.accentSoft }]}>{avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.accountAvatarImage} /> : <Text style={[styles.accountAvatarText, { color: colors.accentDark }]}>{accountLabel.slice(0, 1).toUpperCase()}</Text>}</View>
            {!narrow && <Text style={[styles.accountLabel, { color: colors.chromeText }]}>{accountLabel}</Text>}
            <Ionicons name="chevron-down" size={16} color={colors.chromeMuted} />
          </TouchableOpacity>
        </View>
      </View>
      <AccountMenu visible={menuVisible} onClose={() => setMenuVisible(false)} avatarDataUrl={avatarDataUrl} onAvatarChange={setAvatarDataUrl} displayName={displayName} onDisplayNameChange={(value) => { setDisplayName(value); onDisplayNameChange?.(value); }} />
    </View>
  );
}

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  if (Platform.OS !== 'web') return null;

  return (
    <View style={[styles.footer, { backgroundColor: colors.chrome }, compact && [styles.footerCompact, { borderTopColor: colors.chromeBorder }]]}>
      <View style={[styles.footerInner, narrow && styles.footerInnerNarrow]}>
        <View>
          <BrandWordmark compact />
          {!compact && <Text style={[styles.footerTagline, { color: colors.chromeMuted }]}>ライブの予定と費用を、ひとつの場所に。</Text>}
        </View>
        <View style={[styles.footerLinks, narrow && styles.footerLinksNarrow]}>
          {!compact && <TouchableOpacity onPress={() => router.push('/guide')}><Text style={[styles.footerLink, { color: colors.chromeText }]}>使い方</Text></TouchableOpacity>}
          {!compact && <TouchableOpacity onPress={() => router.push('/contact')}><Text style={[styles.footerLink, { color: colors.chromeText }]}>お問い合わせ</Text></TouchableOpacity>}
          <TouchableOpacity onPress={() => router.push('/privacy')}><Text style={[styles.footerLink, { color: compact ? colors.chromeMuted : colors.chromeText }]}>プライバシー</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/terms')}><Text style={[styles.footerLink, { color: compact ? colors.chromeMuted : colors.chromeText }]}>利用規約</Text></TouchableOpacity>
        </View>
        <Text style={[styles.copyright, { color: colors.chromeMuted }]}>© 2026 GenBGT</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeHeaderBar: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  mark: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 27, fontWeight: '800', letterSpacing: -0.8 },
  wordmarkCompact: { fontSize: 23 },
  header: { borderBottomWidth: 1, zIndex: 10 },
  headerInner: { width: '100%', maxWidth: HEADER_CONTENT_MAX_WIDTH, minHeight: 72, paddingHorizontal: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 32, marginLeft: 54, flex: 1 },
  navText: { fontSize: 14, fontWeight: '600', paddingVertical: 26 },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', gap: 12 },
  outlineButton: { borderWidth: 1, borderRadius: 10, minHeight: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { fontWeight: '700', fontSize: 14 },
  primaryButton: { borderRadius: 10, minHeight: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  textButton: { minHeight: 42, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { fontWeight: '700', fontSize: 14 },
  appHeaderActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  accountButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  accountAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { fontSize: 14, fontWeight: '800' },
  accountAvatarImage: { width: '100%', height: '100%', borderRadius: 18 },
  accountLabel: { fontSize: 14, fontWeight: '500' },
  footer: { paddingVertical: 32, paddingHorizontal: 24 },
  footerCompact: { borderTopWidth: 1, paddingVertical: 20 },
  footerInner: { width: '100%', maxWidth: 1320, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24 },
  footerInnerNarrow: { flexDirection: 'column', alignItems: 'center' },
  footerTagline: { fontSize: 13, marginTop: 10 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 28 },
  footerLinksNarrow: { gap: 18 },
  footerLink: { fontSize: 13 },
  copyright: { fontSize: 12 },
});
