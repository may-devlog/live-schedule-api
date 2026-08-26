import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublicFooter, PublicHeader } from './GenBGTBrand';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

const HERO_TITLE = 'ライブの予定と費用を、ひとつの場所に。';
const HERO_TITLE_LINE1 = 'ライブの予定と費用を、';
const HERO_TITLE_LINE2 = 'ひとつの場所に。';
const HERO_TITLE_TWO_LINES = `${HERO_TITLE_LINE1}\n${HERO_TITLE_LINE2}`;

function measureTextWidth(fontNode: HTMLElement, text: string, fontSizeOverride?: number): number {
  const cs = window.getComputedStyle(fontNode);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const fontSize = fontSizeOverride != null ? `${fontSizeOverride}px` : cs.fontSize;
  ctx.font = `${cs.fontWeight} ${fontSize} ${cs.fontFamily}`;
  return ctx.measureText(text).width;
}

// 指定テキストがcontainerWidthに収まる最大のフォントサイズを返す（baseFontSize以下、
// minFontSize以上）。フォント幅はサイズにほぼ比例するため、baseFontSizeでの実測値から
// 逆算する（0.97倍の安全マージン付き）。段階的な固定サイズの出し分けと違い、
// どんな画面幅でも「行が増える」ことなくフォントサイズだけで収める。
function fitFontSize(fontNode: HTMLElement, text: string, containerWidth: number, baseFontSize: number, minFontSize: number): number {
  const baseWidth = measureTextWidth(fontNode, text, baseFontSize);
  if (!baseWidth || baseWidth <= containerWidth) return baseFontSize;
  const fitted = Math.floor((containerWidth / baseWidth) * baseFontSize * 0.97);
  return Math.max(minFontSize, Math.min(baseFontSize, fitted));
}

function fontMetrics(style: { fontSize?: number; lineHeight?: number }): { fontSize: number; lineHeightRatio: number } {
  const fontSize = style.fontSize ?? 16;
  const lineHeightRatio = style.lineHeight ? style.lineHeight / fontSize : 1.4;
  return { fontSize, lineHeightRatio };
}

// 画面幅の閾値ではなく実測で判定する。閾値方式だと、フォント計量の誤差や
// ヘッダーのボタン表示切り替え幅とのズレにより、1行にも指定の2行にもならない
// 中途半端な折り返しが特定の画面幅で発生してしまうため。RN WebのonLayoutは
// タイミングによって発火しないことがあり当てにならないため、useWindowDimensions
// の変化をトリガーに、コンテナ・フォントの両方をDOMから直接測る。
function useMeasuredWidths(containerRef: React.RefObject<View | null>, fontRef: React.RefObject<Text | null>) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [fontNode, setFontNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const cNode = containerRef.current as unknown as HTMLElement | null;
    const fNode = fontRef.current as unknown as HTMLElement | null;
    if (cNode) setContainerWidth(cNode.getBoundingClientRect().width);
    if (fNode) setFontNode(fNode);
  }, [windowWidth]);

  return { containerWidth, fontNode };
}

const HERO_TITLE_MIN_SIZE = 20;

// 全体が1行に収まる幅ではそのまま、収まらない幅では常にline1/line2の2行に分割し、
// その2行目（より長いline1）が確実に1行に収まるまでフォントサイズを縮める。
// 「行が増える」のではなく「文字が小さくなる」ことで、どんな画面幅でも
// 意図した行数（1行 or 2行）を保つ。
function HeroTitle({ styles }: { styles: ReturnType<typeof getStyles> }) {
  const containerRef = useRef<View>(null);
  const fontRef = useRef<Text>(null);
  const { containerWidth, fontNode } = useMeasuredWidths(containerRef, fontRef);
  const { fontSize: baseFontSize, lineHeightRatio } = fontMetrics(styles.heroTitle);

  let display = HERO_TITLE;
  let fontSize = baseFontSize;
  if (containerWidth && fontNode) {
    const fullWidth = measureTextWidth(fontNode, HERO_TITLE, baseFontSize);
    if (fullWidth > containerWidth) {
      display = HERO_TITLE_TWO_LINES;
      fontSize = fitFontSize(fontNode, HERO_TITLE_LINE1, containerWidth, baseFontSize, HERO_TITLE_MIN_SIZE);
    }
  }

  return (
    <View ref={containerRef} style={styles.heroTitleWrap}>
      <Text ref={fontRef} style={[styles.heroTitle, styles.heroTitleMeasure]}>{HERO_TITLE}</Text>
      <Text style={[styles.heroTitle, { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) }]}>
        {display}
      </Text>
    </View>
  );
}

const BREAKABLE_TEXT_MIN_SIZE = 9;

// 1行に収まる幅ならそのまま、収まらなければbreakAfterの直後で改行する。改行後の
// 2行のうち、より幅の広い方が確実に1行に収まるまでフォントサイズを縮めることで、
// 「行が増える」のではなく「文字が小さくなる」ことでどんな画面幅でも
// 意図した行数（1行 or 指定位置での2行）を保つ。
function BreakableText({ text, breakAfter, style, maxWidth }: { text: string; breakAfter: string; style: any; maxWidth?: number }) {
  const containerRef = useRef<View>(null);
  const fontRef = useRef<Text>(null);
  const { containerWidth, fontNode } = useMeasuredWidths(containerRef, fontRef);
  const { fontSize: baseFontSize, lineHeightRatio } = fontMetrics(style);

  const rest = text.slice(breakAfter.length);
  const measureStyle = { position: 'absolute' as const, opacity: 0 };

  let display = text;
  let fontSize = baseFontSize;
  if (containerWidth && fontNode) {
    const fullWidth = measureTextWidth(fontNode, text, baseFontSize);
    if (fullWidth > containerWidth) {
      display = `${breakAfter}\n${rest}`;
      const line1Width = measureTextWidth(fontNode, breakAfter, baseFontSize);
      const line2Width = measureTextWidth(fontNode, rest, baseFontSize);
      const widerLine = line1Width >= line2Width ? breakAfter : rest;
      fontSize = fitFontSize(fontNode, widerLine, containerWidth, baseFontSize, BREAKABLE_TEXT_MIN_SIZE);
    }
  }

  return (
    <View ref={containerRef} style={{ width: '100%', maxWidth, alignItems: 'center' }}>
      <Text ref={fontRef} style={[style, measureStyle]}>{text}</Text>
      <Text style={[style, { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) }]}>{display}</Text>
    </View>
  );
}

// heroLeadの1文目（改行位置を持たない単一の文）が確実に1行に収まるまで
// フォントサイズを縮める。BreakableTextと同じ考え方の、改行なし版。
function AutoFitLine({ text, style }: { text: string; style: any }) {
  const containerRef = useRef<View>(null);
  const fontRef = useRef<Text>(null);
  const { containerWidth, fontNode } = useMeasuredWidths(containerRef, fontRef);
  const { fontSize: baseFontSize, lineHeightRatio } = fontMetrics(style);
  const measureStyle = { position: 'absolute' as const, opacity: 0 };

  const fontSize =
    containerWidth && fontNode
      ? fitFontSize(fontNode, text, containerWidth, baseFontSize, BREAKABLE_TEXT_MIN_SIZE)
      : baseFontSize;

  return (
    <View ref={containerRef} style={{ width: '100%', alignItems: 'center' }}>
      <Text ref={fontRef} style={[style, measureStyle]}>{text}</Text>
      <Text style={[style, { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) }]}>{text}</Text>
    </View>
  );
}

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
          <HeroTitle styles={styles} />
          <View style={styles.heroLeadWrap}>
            <AutoFitLine text="遠征の日程・交通・宿泊・費用をまとめて管理。" style={styles.heroLead} />
            <BreakableText
              text="出発地や宿泊先を伏せて安全に共有できる、ライブ遠征のためのスケジュール管理サービスです。"
              breakAfter="出発地や宿泊先を伏せて安全に共有できる、"
              style={styles.heroLead}
            />
          </View>
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
          <BreakableText
            text="プレミアムプラン（月額400円、初回1ヶ月無料）では、共有ページの公開やアーカイブの無制限閲覧も可能になります。"
            breakAfter="プレミアムプラン（月額400円、初回1ヶ月無料）では、"
            style={styles.ctaBody}
            maxWidth={780}
          />
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
  heroTitleWrap: { width: '100%', alignItems: 'center' },
  heroTitle: { color: colors.ink, fontSize: 36, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center', lineHeight: 46 },
  heroTitleMeasure: { position: 'absolute', opacity: 0 },
  heroLeadWrap: { width: '100%', alignItems: 'center', marginTop: 20 },
  heroLead: { color: colors.muted, fontSize: 16, lineHeight: 26, textAlign: 'center' },
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
  ctaBody: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 12, marginBottom: 28 },
});
