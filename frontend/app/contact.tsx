import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublicFooter, PublicHeader, brand } from '@/components/GenBGTBrand';
import { API_BASE } from '@/constants/api';

export default function ContactScreen() {
  const router = useRouter();
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
      <PublicHeader active="none" />
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
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>送信する</Text>}
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scrollContent: { flexGrow: 1 },
  main: { width: '100%', maxWidth: 640, alignSelf: 'center', flex: 1, paddingHorizontal: 24, paddingVertical: 46 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 14 },
  backText: { color: brand.violet, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.border, borderRadius: 20, padding: 32 },
  title: { color: brand.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  lead: { color: brand.muted, fontSize: 15, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  label: { color: brand.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#D8D3E0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: brand.ink, backgroundColor: '#FFFFFF', marginBottom: 18 },
  textArea: { minHeight: 140, paddingTop: 14 },
  honeypot: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 11, marginBottom: 16 },
  errorText: { color: '#C2414B', fontSize: 13, lineHeight: 18 },
  submitButton: { height: 50, backgroundColor: brand.violet, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  sentBox: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: brand.violet },
  sentTitle: { color: brand.violetDark, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  sentBody: { color: brand.ink, fontSize: 14, lineHeight: 22 },
});
