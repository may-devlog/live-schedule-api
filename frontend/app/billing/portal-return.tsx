// app/billing/portal-return.tsx - Stripe Billing Portalから戻ってきた場合のページ
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';

export default function BillingPortalReturnScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>お支払い設定の確認</Text>
      <Text style={styles.message}>変更内容は自動的に反映されます。アカウントメニューでプランの状況をご確認ください。</Text>
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
