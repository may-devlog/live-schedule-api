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
import { AuthHeader, BrandMark, PublicFooter, brand } from '@/components/GenBGTBrand';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    if (loading) return;

    try {
      setLoading(true);
      setError(null);
      const result = await login(normalizedEmail, normalizedPassword);
      if (!result.email_verified) {
        setError('メールアドレスの確認が完了していません。登録時に送信されたメールを確認してください。');
        setLoading(false);
        return;
      }
      router.replace('/');
    } catch (authError: any) {
      const message = authError?.message || '認証に失敗しました';
      setError(message.includes('メールアドレス') || message.includes('パスワード') ? 'メールアドレスまたはパスワードが正しくありません' : message);
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
            <Text style={styles.title}>GenBGTにログイン</Text>
            <Text style={styles.subtitle}>ログインして、ライブの予定や思い出を管理しましょう。</Text>

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

            <Text style={styles.label}>パスワード</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="パスワードを入力"
                placeholderTextColor="#A6A0AE"
                value={password}
                onChangeText={(text) => { setPassword(text); setError(null); }}
                onBlur={() => setPassword(password.trim())}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                underlineColorAndroid="transparent"
              />
              <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowPassword(!showPassword)} disabled={loading} accessibilityLabel="パスワードを表示">
                {showPassword ? <IconEye size={19} color={brand.muted} /> : <IconEyeOff size={19} color={brand.muted} />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotButton} onPress={() => router.push('/forgot-password')} disabled={loading}>
              <Text style={styles.linkText}>パスワードを忘れた場合</Text>
            </TouchableOpacity>

            {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <TouchableOpacity style={[styles.loginButton, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.loginButtonText}>ログイン</Text>}
            </TouchableOpacity>

            <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>または</Text><View style={styles.divider} /></View>

            <TouchableOpacity style={styles.registerButton} onPress={() => router.push('/register')} disabled={loading}>
              <Text style={styles.registerText}>新規アカウントを作成</Text>
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scrollContent: { flexGrow: 1 },
  main: { flex: 1, minHeight: 720, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 54, zIndex: 1 },
  form: { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: brand.border, padding: 38, ...cardShadow },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  title: { color: brand.ink, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { color: brand.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9, marginBottom: 28 },
  label: { color: brand.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderColor: '#D8D3E0', borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: brand.ink, backgroundColor: '#FFFFFF', marginBottom: 18 },
  passwordContainer: { height: 50, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: '#D8D3E0', borderRadius: 10, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  passwordInput: { flex: 1, minWidth: 0, paddingHorizontal: 14, fontSize: 15, color: brand.ink },
  passwordToggle: { width: 48, alignItems: 'center', justifyContent: 'center' },
  forgotButton: { alignSelf: 'flex-end', paddingVertical: 10 },
  linkText: { color: brand.violet, fontSize: 13, fontWeight: '600' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 11, marginBottom: 12 },
  errorText: { color: '#C2414B', fontSize: 13, lineHeight: 18 },
  loginButton: { height: 50, backgroundColor: brand.violet, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  buttonDisabled: { opacity: 0.6 },
  loginButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 20 },
  divider: { flex: 1, height: 1, backgroundColor: brand.border },
  dividerText: { color: brand.muted, fontSize: 12 },
  registerButton: { height: 50, borderWidth: 1, borderColor: brand.violet, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  registerText: { color: brand.violet, fontSize: 14, fontWeight: '700' },
  tagline: { color: brand.muted, fontSize: 14, marginTop: 28, textAlign: 'center' },
  decorLeft: { position: 'absolute', width: 360, height: 360, borderRadius: 180, left: -200, top: 170, backgroundColor: '#EDE9FE', opacity: 0.55 },
  decorRight: { position: 'absolute', width: 300, height: 300, borderRadius: 150, right: -150, top: 250, backgroundColor: '#EDE9FE', opacity: 0.55 },
});
