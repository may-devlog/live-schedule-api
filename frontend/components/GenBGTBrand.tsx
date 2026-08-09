import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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

export function BrandMark({ size = 42 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.24 }]}>
      <Ionicons name="calendar-outline" size={size * 0.58} color="#FFFFFF" />
      <View style={styles.sparkle}><Ionicons name="sparkles" size={size * 0.25} color="#FFFFFF" /></View>
    </View>
  );
}

export function BrandWordmark({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <View style={styles.wordmarkRow}>
      <BrandMark size={compact ? 34 : 42} />
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
            <TouchableOpacity style={styles.textButton} onPress={() => router.push('/public')}>
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

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={[styles.footerInner, narrow && styles.footerInnerNarrow]}>
        <View>
          <BrandWordmark light compact />
          {!compact && <Text style={styles.footerTagline}>ライブの予定と思い出を、ひとつの場所に。</Text>}
        </View>
        <View style={[styles.footerLinks, narrow && styles.footerLinksNarrow]}>
          {!compact && <Text style={styles.footerLink}>使い方</Text>}
          {!compact && <Text style={styles.footerLink}>お問い合わせ</Text>}
          <Text style={styles.footerLink}>プライバシー</Text>
          <Text style={styles.footerLink}>利用規約</Text>
        </View>
        <Text style={styles.copyright}>© 2026 GenBGT</Text>
      </View>
    </View>
  );
}

const webShadow = Platform.OS === 'web' ? ({ boxShadow: '0 8px 28px rgba(46,16,101,0.08)' } as any) : {};

const styles = StyleSheet.create({
  mark: { backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center', position: 'relative', ...webShadow },
  sparkle: { position: 'absolute', right: 1, bottom: 0 },
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
  footer: { backgroundColor: brand.plum, paddingVertical: 32, paddingHorizontal: 24 },
  footerCompact: { backgroundColor: brand.white, borderTopWidth: 1, borderTopColor: brand.border, paddingVertical: 20 },
  footerInner: { width: '100%', maxWidth: 1320, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24 },
  footerInnerNarrow: { flexDirection: 'column', alignItems: 'center' },
  footerTagline: { color: '#DDD6FE', fontSize: 13, marginTop: 10 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 28 },
  footerLinksNarrow: { gap: 18 },
  footerLink: { color: brand.white, fontSize: 13 },
  copyright: { color: '#C4B5FD', fontSize: 12 },
});
