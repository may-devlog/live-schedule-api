import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { IconEye, IconEyeOff } from '@/components/FeatherSvgIcons';
import { AuthHeader, BrandMark, PublicFooter } from '@/components/GenBGTBrand';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';

// 新規ユーザー登録はバックエンド側で一時的に停止している（ALLOW_USER_REGISTRATION）。
// フォームを送信しても必ず失敗するため、送信前に案内して入力自体をできないようにする。
const REGISTRATION_SUSPENDED = true;

export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shareId, setShareId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim() || !shareId.trim()) {
      setError('メールアドレス、パスワード、ユーザーIDを入力してください');
      return;
    }

    if (shareId.length < 3 || shareId.length > 20) {
      setError('ユーザーIDは3文字以上20文字以下で入力してください');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(shareId)) {
      setError('ユーザーIDは英数字、ハイフン、アンダースコアのみ使用できます');
      return;
    }

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含めてください');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await register(email.trim(), password, shareId.trim());
      router.replace('/login');
    } catch (submitError: any) {
      setError(submitError?.message || '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <AuthHeader />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.decorLeft} />
        <View style={styles.decorRight} />
        <View style={styles.main}>
          <View style={styles.form}>
            <View style={styles.logoWrap}><BrandMark size={58} /></View>
            <Text style={styles.title}>新規登録</Text>
            <Text style={styles.subtitle}>GenBGTのアカウントを作成しましょう。</Text>

            {REGISTRATION_SUSPENDED && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>現在、新規ユーザー登録を停止しています</Text>
                <Text style={styles.noticeBody}>大変申し訳ございませんが、しばらくお待ちください。既にアカウントをお持ちの方はログインしてご利用いただけます。</Text>
              </View>
            )}

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
              editable={!loading && !REGISTRATION_SUSPENDED}
            />

            <Text style={styles.label}>ユーザーID</Text>
            <TextInput
              style={styles.input}
              placeholder="3-20文字、英数字・ハイフン・アンダースコア"
              placeholderTextColor="#A6A0AE"
              value={shareId}
              onChangeText={(text) => { setShareId(text); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !REGISTRATION_SUSPENDED}
            />

            <Text style={styles.label}>パスワード</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="8文字以上・英字と数字を含む"
                placeholderTextColor="#A6A0AE"
                value={password}
                onChangeText={(text) => { setPassword(text); setError(null); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && !REGISTRATION_SUSPENDED}
                underlineColorAndroid="transparent"
              />
              <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowPassword(!showPassword)} disabled={loading} accessibilityLabel="パスワードを表示">
                {showPassword ? <IconEye size={19} color={colors.muted} /> : <IconEyeOff size={19} color={colors.muted} />}
              </TouchableOpacity>
            </View>

            {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <TouchableOpacity
              style={[styles.registerButton, (loading || REGISTRATION_SUSPENDED) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || REGISTRATION_SUSPENDED}
            >
              {loading ? <ActivityIndicator color={colors.accentContrastText} /> : <Text style={styles.registerButtonText}>登録</Text>}
            </TouchableOpacity>

            <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>または</Text><View style={styles.divider} /></View>

            <TouchableOpacity style={styles.loginLinkButton} onPress={() => router.push('/login')} disabled={loading}>
              <Text style={styles.loginLinkText}>ログイン画面に戻る</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.tagline}>ライブの予定と費用を、ひとつの場所に。</Text>
        </View>
        <PublicFooter compact />
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(46,16,101,0.10)' } as any) : {};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceAlt },
  scrollContent: { flexGrow: 1 },
  main: { flex: 1, minHeight: 720, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 54, zIndex: 1 },
  form: { width: '100%', maxWidth: 460, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 38, ...cardShadow },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9, marginBottom: 20 },
  noticeBox: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 16, marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#D97706' },
  noticeTitle: { color: '#92400E', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  noticeBody: { color: '#92400E', fontSize: 13, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: colors.ink, backgroundColor: colors.surface, marginBottom: 18 },
  passwordContainer: { height: 50, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, overflow: 'hidden' },
  passwordInput: { flex: 1, minWidth: 0, paddingHorizontal: 14, fontSize: 15, color: colors.ink },
  passwordToggle: { width: 48, alignItems: 'center', justifyContent: 'center' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 11, marginTop: 14 },
  errorText: { color: '#C2414B', fontSize: 13, lineHeight: 18 },
  registerButton: { height: 50, backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.4 },
  registerButtonText: { color: colors.accentContrastText, fontSize: 15, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 20 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 12 },
  loginLinkButton: { height: 50, borderWidth: 1, borderColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loginLinkText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  tagline: { color: colors.muted, fontSize: 14, marginTop: 28, textAlign: 'center' },
  decorLeft: { position: 'absolute', width: 360, height: 360, borderRadius: 180, left: -200, top: 170, backgroundColor: colors.accentSoft, opacity: 0.55 },
  decorRight: { position: 'absolute', width: 300, height: 300, borderRadius: 150, right: -150, top: 250, backgroundColor: colors.accentSoft, opacity: 0.55 },
});
