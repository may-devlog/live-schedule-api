// app/billing/cancel.tsx - Stripe Checkoutをキャンセルした場合の戻り先ページ
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';

export default function BillingCancelScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>お支払いをキャンセルしました</Text>
      <Text style={styles.message}>プレミアムプランへの登録は完了していません。もう一度お試しになる場合は、アカウントメニューからやり直してください。</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/')}>
        <Text style={styles.buttonText}>ホームに戻る</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12, color: colors.ink, textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center', marginBottom: 24, color: colors.muted, lineHeight: 22 },
  button: { backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
  buttonText: { color: colors.accentContrastText, fontSize: 16, fontWeight: '700' },
});
