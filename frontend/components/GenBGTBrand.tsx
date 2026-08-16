import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { AccountMenu } from './AccountMenu';
import { NotificationMenu } from './NotificationMenu';
import { fetchProfile } from '../utils/profile-request';

// Web版ヘッダーの代わりにネイティブで表示する、Safe Area分の余白のみのスペーサー
function NativeTopSpacer() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: brand.white }} />;
}

// ログイン中のネイティブ画面向け: Safe Area余白+右上のハンバーガーメニュー（通知・アカウント）
function NativeAppHeaderBar({ onDisplayNameChange }: { onDisplayNameChange?: (value: string | null) => void }) {
  const insets = useSafeAreaInsets();
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [accountVisible, setAccountVisible] = useState(false);

  useEffect(() => {
    fetchProfile(true)
      .then((profile) => {
        setAvatarDataUrl(profile?.avatar_data_url ?? null);
        setDisplayName(profile?.display_name ?? null);
      })
      .catch(() => { setAvatarDataUrl(null); setDisplayName(null); });
  }, []);

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: brand.white, borderBottomWidth: 1, borderBottomColor: brand.border }}>
      <View style={styles.nativeHeaderBar}>
        <TouchableOpacity style={styles.nativeMenuButton} onPress={() => setMenuOpen(true)} accessibilityLabel="メニューを開く">
          <Ionicons name="menu" size={26} color={brand.ink} />
        </TouchableOpacity>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.nativeMenuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[styles.nativeMenuPanel, { top: insets.top + 52 }]}>
            <TouchableOpacity
              style={styles.nativeMenuItem}
              onPress={() => { setMenuOpen(false); setNotificationsVisible(true); }}
            >
              <Ionicons name="notifications-outline" size={19} color={brand.violetDark} />
              <Text style={styles.nativeMenuItemText}>通知</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.nativeMenuItem}
              onPress={() => { setMenuOpen(false); setAccountVisible(true); }}
            >
              <Ionicons name="person-outline" size={19} color={brand.violetDark} />
              <Text style={styles.nativeMenuItemText}>アカウント</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <NotificationMenu hideTrigger visible={notificationsVisible} onClose={() => setNotificationsVisible(false)} />
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

export const brand = {
  violet: '#7C3AED',
  violetDark: '#5B21B6',
  plum: '#2E1065',
  lavender: '#F5F3FF',
  ink: '#201B2C',
  muted: '#6B6675',
  border: '#E8E3F1',
  white: '#FFFFFF',
};

export function BrandMark({ size = 42, light = false }: { size?: number; light?: boolean }) {
  const markColor = light ? brand.white : brand.violetDark;
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <Ionicons name="calendar-outline" size={size * 0.86} color={markColor} />
      <View style={[styles.sparkle, { right: size * 0.06, bottom: size * 0.12 }]}>
        <Text style={[styles.sparkleGlyph, { color: markColor, fontSize: size * 0.34, lineHeight: size * 0.34 }]}>✦</Text>
      </View>
    </View>
  );
}

export function BrandWordmark({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <View style={styles.wordmarkRow}>
      <BrandMark size={compact ? 34 : 42} light={light} />
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact, light && styles.lightText]}>GenBGT</Text>
    </View>
  );
}

export function PublicHeader({ active = 'archive', homePath = '/' }: { active?: 'home' | 'archive' | 'none'; homePath?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  if (Platform.OS !== 'web') return <NativeTopSpacer />;

  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push(homePath)} activeOpacity={0.8}>
          <BrandWordmark compact={narrow} />
        </TouchableOpacity>
        {!narrow && (
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => router.push(homePath)}><Text style={[styles.navText, active === 'home' && styles.navActive]}>HOME</Text></TouchableOpacity>
            <Text style={[styles.navText, active === 'archive' && styles.navActive]}>ARCHIVE</Text>
          </View>
        )}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.outlineButton} onPress={() => router.push('/login')}>
            <Text style={styles.outlineButtonText}>ログイン</Text>
          </TouchableOpacity>
          {!narrow && (
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/register')}>
              <Text style={styles.primaryButtonText}>GenBGTをはじめる</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export function AuthHeader() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 640;

  if (Platform.OS !== 'web') return <NativeTopSpacer />;

  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <BrandWordmark compact={narrow} />
        <View style={styles.headerActions}>
          {!narrow && (
            <TouchableOpacity style={styles.textButton} onPress={() => router.push('/find-user')}>
              <Text style={styles.textButtonText}>共有ページを見る</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.outlineButton} onPress={() => router.push('/register')}>
            <Text style={styles.outlineButtonText}>新規登録</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function AppHeader({ active = 'archive', onDisplayNameChange }: { active?: 'home' | 'archive'; onDisplayNameChange?: (value: string | null) => void }) {
  const router = useRouter();
  const { email } = useAuth();
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
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.8}><BrandWordmark compact={narrow} /></TouchableOpacity>
        {!narrow && <View style={styles.nav}>
          <TouchableOpacity onPress={() => router.push('/')}><Text style={[styles.navText, active === 'home' && styles.navActive]}>HOME</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/year/${new Date().getFullYear()}`)}><Text style={[styles.navText, active === 'archive' && styles.navActive]}>ARCHIVE</Text></TouchableOpacity>
        </View>}
        <View style={styles.appHeaderActions}>
          <NotificationMenu />
          <TouchableOpacity style={styles.accountButton} onPress={() => setMenuVisible(true)}>
            <View style={styles.accountAvatar}>{avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.accountAvatarImage} /> : <Text style={styles.accountAvatarText}>{accountLabel.slice(0, 1).toUpperCase()}</Text>}</View>
            {!narrow && <Text style={styles.accountLabel}>{accountLabel}</Text>}
            <Ionicons name="chevron-down" size={16} color={brand.muted} />
          </TouchableOpacity>
        </View>
      </View>
      <AccountMenu visible={menuVisible} onClose={() => setMenuVisible(false)} avatarDataUrl={avatarDataUrl} onAvatarChange={setAvatarDataUrl} displayName={displayName} onDisplayNameChange={(value) => { setDisplayName(value); onDisplayNameChange?.(value); }} />
    </View>
  );
}

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  if (Platform.OS !== 'web') return null;

  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={[styles.footerInner, narrow && styles.footerInnerNarrow]}>
        <View>
          <BrandWordmark light={!compact} compact />
          {!compact && <Text style={styles.footerTagline}>ライブの予定と費用を、ひとつの場所に。</Text>}
        </View>
        <View style={[styles.footerLinks, narrow && styles.footerLinksNarrow]}>
          {!compact && <TouchableOpacity onPress={() => router.push('/guide')}><Text style={styles.footerLink}>使い方</Text></TouchableOpacity>}
          {!compact && <TouchableOpacity onPress={() => router.push('/contact')}><Text style={styles.footerLink}>お問い合わせ</Text></TouchableOpacity>}
          <TouchableOpacity onPress={() => router.push('/privacy')}><Text style={[styles.footerLink, compact && styles.footerLinkCompact]}>プライバシー</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/terms')}><Text style={[styles.footerLink, compact && styles.footerLinkCompact]}>利用規約</Text></TouchableOpacity>
        </View>
        <Text style={[styles.copyright, compact && styles.copyrightCompact]}>© 2026 GenBGT</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeHeaderBar: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  nativeMenuButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nativeMenuOverlay: { flex: 1, backgroundColor: 'rgba(32,27,44,0.32)', alignItems: 'flex-end' },
  nativeMenuPanel: { position: 'absolute', right: 16, width: 180, borderRadius: 12, backgroundColor: brand.white, paddingVertical: 6, shadowColor: '#1C1133', shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  nativeMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  nativeMenuItemText: { color: brand.ink, fontSize: 14, fontWeight: '600' },
  mark: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  sparkle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sparkleGlyph: { fontWeight: '800', textAlign: 'center' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 27, fontWeight: '800', letterSpacing: -0.8, color: brand.ink },
  wordmarkCompact: { fontSize: 23 },
  lightText: { color: brand.white },
  header: { backgroundColor: brand.white, borderBottomWidth: 1, borderBottomColor: brand.border, zIndex: 10 },
  headerInner: { width: '100%', maxWidth: HEADER_CONTENT_MAX_WIDTH, minHeight: 72, paddingHorizontal: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 32, marginLeft: 54, flex: 1 },
  navText: { color: brand.ink, fontSize: 14, fontWeight: '600', paddingVertical: 26 },
  navActive: { color: brand.violet, borderBottomWidth: 2, borderBottomColor: brand.violet },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', gap: 12 },
  outlineButton: { borderWidth: 1, borderColor: brand.violet, borderRadius: 10, minHeight: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { color: brand.violet, fontWeight: '700', fontSize: 14 },
  primaryButton: { backgroundColor: brand.violet, borderRadius: 10, minHeight: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: brand.white, fontWeight: '700', fontSize: 14 },
  textButton: { minHeight: 42, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: brand.violet, fontWeight: '700', fontSize: 14 },
  appHeaderActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  accountAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: brand.violetDark, fontSize: 14, fontWeight: '800' },
  accountAvatarImage: { width: '100%', height: '100%', borderRadius: 18 },
  accountLabel: { color: brand.ink, fontSize: 14, fontWeight: '500' },
  footer: { backgroundColor: brand.plum, paddingVertical: 32, paddingHorizontal: 24 },
  footerCompact: { backgroundColor: brand.white, borderTopWidth: 1, borderTopColor: brand.border, paddingVertical: 20 },
  footerInner: { width: '100%', maxWidth: 1320, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24 },
  footerInnerNarrow: { flexDirection: 'column', alignItems: 'center' },
  footerTagline: { color: '#DDD6FE', fontSize: 13, marginTop: 10 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 28 },
  footerLinksNarrow: { gap: 18 },
  footerLink: { color: brand.white, fontSize: 13 },
  footerLinkCompact: { color: brand.muted },
  copyright: { color: '#C4B5FD', fontSize: 12 },
  copyrightCompact: { color: brand.muted },
});
