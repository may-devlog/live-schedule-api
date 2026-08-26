import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublicFooter, PublicHeader } from '@/components/GenBGTBrand';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { API_BASE } from '@/constants/api';

export default function ContactScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // ハニーポット: 人間には見せず、埋まっていればボットとみなす
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    const normalizedEmail = email.trim();
    const normalizedMessage = message.trim();
    if (!normalizedEmail || !normalizedMessage) {
      setError('メールアドレスとお問い合わせ内容を入力してください');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          subject: subject.trim(),
          message: normalizedMessage,
          website,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '送信に失敗しました' }));
        throw new Error(data.error || '送信に失敗しました');
      }

      setSent(true);
    } catch (submitError: any) {
      setError(submitError?.message || '送信に失敗しました。時間をおいて再度お試しください');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <PublicHeader active="none" showNav={false} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.main}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <View style={styles.card}>
            <Text style={styles.title}>お問い合わせ</Text>
            <Text style={styles.lead}>GenBGTへのご意見・不具合報告を受け付ける窓口です。いただいた内容は入力いただいたメールアドレス宛てに返信します。</Text>

            {sent ? (
              <View style={styles.sentBox}>
                <Text style={styles.sentTitle}>送信しました</Text>
                <Text style={styles.sentBody}>お問い合わせありがとうございます。ご入力いただいたメールアドレス宛てに、内容の確認メールをお送りしました。担当より改めてご連絡いたします。</Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>お名前（任意）</Text>
                <TextInput
                  style={styles.input}
                  placeholder="山田 太郎"
                  placeholderTextColor="#A6A0AE"
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                />

                <Text style={styles.label}>メールアドレス</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#A6A0AE"
                  value={email}
                  onChangeText={(text) => { setEmail(text); setError(null); }}
                  onBlur={() => setEmail(email.trim())}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />

                <Text style={styles.label}>件名（任意）</Text>
                <TextInput
                  style={styles.input}
                  placeholder="お問い合わせの件名"
                  placeholderTextColor="#A6A0AE"
                  value={subject}
                  onChangeText={setSubject}
                  editable={!loading}
                />

                <Text style={styles.label}>お問い合わせ内容</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="不具合の内容やご要望など、できるだけ詳しくご記入ください"
                  placeholderTextColor="#A6A0AE"
                  value={message}
                  onChangeText={(text) => { setMessage(text); setError(null); }}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  editable={!loading}
                />

                {/* ハニーポット: 通常のフォーム利用者には見えない項目 */}
                <TextInput
                  style={styles.honeypot}
                  value={website}
                  onChangeText={setWebsite}
                  autoCapitalize="none"
                  autoCorrect={false}
                  tabIndex={-1}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />

                {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

                <TouchableOpacity style={[styles.submitButton, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.accentContrastText} /> : <Text style={styles.submitButtonText}>送信する</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        <PublicFooter />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceAlt },
  scrollContent: { flexGrow: 1 },
  main: { width: '100%', maxWidth: 640, alignSelf: 'center', flex: 1, paddingHorizontal: 24, paddingVertical: 46 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 14 },
  backText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 32 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.surface, marginBottom: 18 },
  textArea: { minHeight: 140, paddingTop: 14 },
  honeypot: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 11, marginBottom: 16 },
  errorText: { color: '#C2414B', fontSize: 13, lineHeight: 18 },
  submitButton: { height: 50, backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  submitButtonText: { color: colors.accentContrastText, fontSize: 15, fontWeight: '800' },
  sentBox: { backgroundColor: colors.accentSoft, borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: colors.accent },
  sentTitle: { color: colors.accentDark, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  sentBody: { color: colors.ink, fontSize: 14, lineHeight: 22 },
});
