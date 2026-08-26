import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { API_BASE } from '../constants/api';
import { IconEye, IconEyeOff } from '@/components/FeatherSvgIcons';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const params = useLocalSearchParams<{ token?: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const resetToken = params.token || '';

  const handleResetPassword = async () => {
    console.log('[ResetPassword] Starting password reset');
    console.log('[ResetPassword] Token:', resetToken ? 'present' : 'missing');
    console.log('[ResetPassword] API_BASE:', API_BASE);
    
    if (!resetToken) {
      setError('リセットトークンがありません');
      return;
    }

    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含めてください');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('[ResetPassword] Sending request to:', `${API_BASE}/auth/reset-password`);
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          new_password: newPassword,
        }),
      });

      console.log('[ResetPassword] Response status:', res.status);
      
      if (!res.ok) {
        let errorData;
        try {
          const text = await res.text();
          console.error('[ResetPassword] Error response text:', text);
          errorData = JSON.parse(text);
        } catch (parseError) {
          console.error('[ResetPassword] Failed to parse error response:', parseError);
          errorData = { error: `パスワードリセットに失敗しました (status: ${res.status})` };
        }
        throw new Error(errorData.error || 'パスワードリセットに失敗しました');
      }

      const data = await res.json();
      console.log('[ResetPassword] Success:', data);
      
      setSuccess(true);
      // 3秒後にログイン画面に遷移
      setTimeout(() => {
        router.replace('/login');
      }, 3000);
    } catch (error: any) {
      console.error('[ResetPassword] Error:', error);
      setError(error.message || 'パスワードリセットに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.title}>エラー</Text>
          <Text style={styles.message}>
            リセットトークンが指定されていません。
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/forgot-password')}
          >
            <Text style={styles.buttonText}>パスワードリセット要求へ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.title}>パスワードリセット完了</Text>
          <Text style={styles.successMessage}>
            パスワードのリセットが完了しました。
            {'\n'}3秒後にログイン画面に移動します。
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.buttonText}>ログイン画面へ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>パスワードをリセット</Text>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="新しいパスワード"
            placeholderTextColor={colors.muted}
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              setError(null);
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            underlineColorAndroid="transparent"
          />
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowPassword(!showPassword)}
            disabled={loading}
          >
            {showPassword ? (
              <IconEye size={18} color={colors.muted} />
            ) : (
              <IconEyeOff size={18} color={colors.muted} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="パスワード（確認）"
            placeholderTextColor={colors.muted}
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setError(null);
            }}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            underlineColorAndroid="transparent"
          />
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={loading}
          >
            {showConfirmPassword ? (
              <IconEye size={18} color={colors.muted} />
            ) : (
              <IconEyeOff size={18} color={colors.muted} />
            )}
          </TouchableOpacity>
        </View>

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleResetPassword}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.accentContrastText} />
          ) : (
            <Text style={styles.buttonText}>パスワードをリセット</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.backButtonText}>ログイン画面へ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardShadow = Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(46,16,101,0.10)' } as any) : {};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    padding: 20,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    ...cardShadow,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: colors.ink,
  },
  message: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
    fontSize: 16,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colors.ink,
    ...(Platform.OS === 'web'
      ? { outlineStyle: 'none' as const, outlineWidth: 0 }
      : {}),
  },
  passwordToggle: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 8,
    paddingRight: 12,
    minWidth: 44,
  },
  errorText: {
    color: '#C2414B',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  successIcon: {
    fontSize: 64,
    color: '#16A34A',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  successMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: colors.muted,
    lineHeight: 24,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.accentContrastText,
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
    color: colors.accent,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
