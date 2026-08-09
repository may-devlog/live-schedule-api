import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublicFooter, PublicHeader, brand } from './GenBGTBrand';

export type InfoSection = { heading: string; body: string };

export function StaticInfoPage({ title, lead, sections, notice }: { title: string; lead: string; sections: InfoSection[]; notice?: string }) {
  const router = useRouter();
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
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scrollContent: { flexGrow: 1 },
  main: { width: '100%', maxWidth: 900, alignSelf: 'center', flex: 1, paddingHorizontal: 24, paddingVertical: 46 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 14 },
  backText: { color: brand.violet, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.border, borderRadius: 20, padding: 32, ...shadow },
  title: { color: brand.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  lead: { color: brand.muted, fontSize: 15, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  notice: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 16, marginBottom: 28, borderLeftWidth: 4, borderLeftColor: brand.violet },
  noticeText: { color: brand.violetDark, fontSize: 14, lineHeight: 22, fontWeight: '600' },
  section: { paddingVertical: 20, borderTopWidth: 1, borderTopColor: brand.border },
  heading: { color: brand.ink, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  body: { color: brand.muted, fontSize: 14, lineHeight: 24 },
});
