import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { authenticatedFetch, getApiUrl } from '../utils/api';
import { AccountMenu } from './AccountMenu';
import { NotificationMenu } from './NotificationMenu';
import { fetchProfile } from '../utils/profile-request';

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

export function PublicHeader({ active = 'schedule' }: { active?: 'schedule' | 'archive' | 'none' }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.8}>
          <BrandWordmark compact={narrow} />
        </TouchableOpacity>
        {!narrow && (
          <View style={styles.nav}>
            <Text style={[styles.navText, active === 'schedule' && styles.navActive]}>スケジュール</Text>
            <Text style={[styles.navText, active === 'archive' && styles.navActive]}>アーカイブ</Text>
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

export function AppHeader({ active = 'schedule', onDisplayNameChange }: { active?: 'schedule' | 'archive'; onDisplayNameChange?: (value: string | null) => void }) {
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
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.8}><BrandWordmark compact={narrow} /></TouchableOpacity>
        {!narrow && <View style={styles.nav}>
          <TouchableOpacity onPress={() => router.push('/')}><Text style={[styles.navText, active === 'schedule' && styles.navActive]}>スケジュール</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/year/${new Date().getFullYear()}`)}><Text style={[styles.navText, active === 'archive' && styles.navActive]}>アーカイブ</Text></TouchableOpacity>
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
  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={[styles.footerInner, narrow && styles.footerInnerNarrow]}>
        <View>
          <BrandWordmark light={!compact} compact />
          {!compact && <Text style={styles.footerTagline}>ライブの予定と思い出を、ひとつの場所に。</Text>}
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
  mark: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  sparkle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sparkleGlyph: { fontWeight: '800', textAlign: 'center' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 27, fontWeight: '800', letterSpacing: -0.8, color: brand.ink },
  wordmarkCompact: { fontSize: 23 },
  lightText: { color: brand.white },
  header: { backgroundColor: brand.white, borderBottomWidth: 1, borderBottomColor: brand.border, zIndex: 10 },
  headerInner: { width: '100%', maxWidth: 1320, minHeight: 72, paddingHorizontal: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center' },
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
