import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublicFooter, PublicHeader } from './GenBGTBrand';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

type Feature = { image: number; heading: string; body: string };

const FEATURES: Feature[] = [
  {
    image: require('../assets/images/guide/schedule-new-form.png'),
    heading: 'ライブの予定を一元管理',
    body: '公演名・日時・会場・出演者などを登録。グループやお目当てなどの分類も自分好みに作成でき、色や並び順まで自由にカスタマイズできます。',
  },
  {
    image: require('../assets/images/guide/schedule-traffic-stay.png'),
    heading: '交通・宿泊費もまとめて自動集計',
    body: 'スケジュールに交通・宿泊情報を紐づけると、遠征全体の合計費用が自動で計算されます。',
  },
  {
    image: require('../assets/images/guide/share-page-masked.png'),
    heading: '出発地・宿泊先をマスクして安全に共有',
    body: '最寄駅やホテル名は共有ページ上で自動的に伏せられるので、行動範囲を知られる心配なく予定を共有できます。',
  },
  {
    image: require('../assets/images/guide/calendar.png'),
    heading: 'カレンダー・年別アーカイブで振り返り',
    body: '登録した予定はカレンダーに反映。終了したライブは年別アーカイブからいつでも振り返れます。',
  },
];

export function LandingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const styles = getStyles(colors);

  return (
    <View style={styles.page}>
      <PublicHeader active="home" showNav={false} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>ライブの予定と費用を、ひとつの場所に。</Text>
          <Text style={styles.heroLead}>
            遠征の日程・交通・宿泊・費用をまとめて管理。出発地や宿泊先を伏せて安全に共有できる、ライブ遠征のためのスケジュール管理サービスです。
          </Text>
          <TouchableOpacity style={styles.textButton} onPress={() => router.push('/guide')}>
            <Text style={[styles.textButtonText, { color: colors.accent }]}>使い方を見る →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.featuresSection}>
          <View style={[styles.featureGrid, narrow && styles.featureGridNarrow]}>
            {FEATURES.map((feature) => (
              <View key={feature.heading} style={[styles.featureCard, narrow && styles.featureCardNarrow]}>
                <View style={styles.featureImageFrame}>
                  <Image source={feature.image} style={styles.featureImage} resizeMode="cover" />
                </View>
                <Text style={styles.featureHeading}>{feature.heading}</Text>
                <Text style={styles.featureBody}>{feature.body}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.ctaBand, { backgroundColor: colors.accentSoft }]}>
          <Text style={styles.ctaTitle}>今すぐ無料ではじめよう</Text>
          <Text style={styles.ctaBody}>プレミアムプラン（月額400円、初回1ヶ月無料）では、共有ページの公開やアーカイブの無制限閲覧も可能になります。</Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={() => router.push('/register')}>
            <Text style={[styles.primaryButtonText, { color: colors.accentContrastText }]}>無料ではじめる</Text>
          </TouchableOpacity>
        </View>

        <PublicFooter />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceAlt },
  scrollContent: { flexGrow: 1 },
  hero: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48, alignItems: 'center' },
  heroTitle: { color: colors.ink, fontSize: 36, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center', lineHeight: 46 },
  heroLead: { color: colors.muted, fontSize: 16, lineHeight: 26, marginTop: 20, textAlign: 'center', maxWidth: 560 },
  primaryButton: { borderRadius: 10, minHeight: 48, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontWeight: '800', fontSize: 15 },
  textButton: { minHeight: 40, paddingHorizontal: 10, marginTop: 28, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { fontWeight: '700', fontSize: 15 },
  featuresSection: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 56 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  featureGridNarrow: { flexDirection: 'column', flexWrap: 'nowrap' },
  featureCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 24 },
  featureCardNarrow: { flexBasis: 'auto', flexGrow: 0, width: '100%' },
  featureImageFrame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginBottom: 18 },
  featureImage: { width: '100%', height: '100%' },
  featureHeading: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  featureBody: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  ctaBand: { width: '100%', paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center' },
  ctaTitle: { color: colors.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  ctaBody: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 12, marginBottom: 28, maxWidth: 520 },
});
