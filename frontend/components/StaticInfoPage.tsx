import React from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublicFooter, PublicHeader } from './GenBGTBrand';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

export type InfoImage = { source: number; caption?: string; aspectRatio?: number };
export type InfoSection = { heading: string; body: string; images?: InfoImage[] };

export function StaticInfoPage({ title, lead, sections, notice }: { title: string; lead: string; sections: InfoSection[]; notice?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.page}>
      <PublicHeader active="none" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.main}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.lead}>{lead}</Text>
            {!!notice && <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
            {sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.heading}>{section.heading}</Text>
                <Text style={styles.body}>{section.body}</Text>
                {!!section.images?.length && (
                  <View style={styles.imageRow}>
                    {section.images.map((image, index) => (
                      <View key={index} style={styles.imageBlock}>
                        <View style={[styles.imageFrame, { aspectRatio: image.aspectRatio ?? 16 / 9 }]}>
                          <Image source={image.source} style={styles.image} resizeMode="cover" />
                        </View>
                        {!!image.caption && <Text style={styles.imageCaption}>{image.caption}</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
        <PublicFooter />
      </ScrollView>
    </View>
  );
}

const shadow = Platform.OS === 'web' ? ({ boxShadow: '0 12px 36px rgba(46,16,101,0.06)' } as any) : {};
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceAlt },
  scrollContent: { flexGrow: 1 },
  main: { width: '100%', maxWidth: 900, alignSelf: 'center', flex: 1, paddingHorizontal: 24, paddingVertical: 46 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 14 },
  backText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 32, ...shadow },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  notice: { backgroundColor: colors.accentSoft, borderRadius: 12, padding: 16, marginBottom: 28, borderLeftWidth: 4, borderLeftColor: colors.accent },
  noticeText: { color: colors.accentDark, fontSize: 14, lineHeight: 22, fontWeight: '600' },
  section: { paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.border },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 18 },
  imageBlock: { width: '100%', maxWidth: 420 },
  imageFrame: { width: '100%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  imageCaption: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 24 },
});
