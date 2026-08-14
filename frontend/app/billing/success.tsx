// app/billing/success.tsx - Stripe Checkout完了後の戻り先ページ
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { authenticatedFetch, getApiUrl } from '../../utils/api';

export default function BillingSuccessScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'confirmed' | 'pending'>('checking');

  useEffect(() => {
    let cancelled = false;

    // Webhookの反映には数秒かかることがあるため、plan-statusを数回リトライして確認する
    const checkPlanStatus = async (attempt: number) => {
      try {
        const response = await authenticatedFetch(getApiUrl('/auth/plan-status'));
        const data = await response.json();
        if (cancelled) return;
        if (response.ok && data.plan === 'premium') {
          setStatus('confirmed');
          return;
        }
      } catch {
        // 無視して再試行する
      }
      if (cancelled) return;
      if (attempt >= 5) {
        setStatus('pending');
        return;
      }
      setTimeout(() => checkPlanStatus(attempt + 1), 1500);
    };

    checkPlanStatus(0);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      {status === 'checking' && (
        <>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.message}>お支払い状況を確認しています…</Text>
        </>
      )}
      {status === 'confirmed' && (
        <>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.title}>プレミアムプランへようこそ</Text>
          <Text style={styles.message}>お支払いが完了し、プレミアム機能がご利用いただけるようになりました。</Text>
        </>
      )}
      {status === 'pending' && (
        <>
          <Text style={styles.title}>お支払いを受け付けました</Text>
          <Text style={styles.message}>反映まで少し時間がかかる場合があります。しばらくしてからアカウントメニューでご確認ください。</Text>
        </>
      )}
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/')}>
        <Text style={styles.buttonText}>ホームに戻る</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#ffffff' },
  title: { fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 12, color: '#201B2C', textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center', marginBottom: 24, color: '#6B6675', lineHeight: 22 },
  successIcon: { fontSize: 56, color: '#7C3AED' },
  button: { backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, marginTop: 8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
