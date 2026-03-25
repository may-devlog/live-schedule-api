import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { IconEye, IconEyeOff } from '@/components/FeatherSvgIcons';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    // 入力値を正規化（最新の状態を確実に取得）
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();
    
    if (!normalizedEmail || !normalizedPassword) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    // ローディング中は処理をスキップ
    if (loading) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // デバッグログ（本番環境では削除推奨）
      console.log('[LoginScreen] Attempting login with email:', normalizedEmail);
      
      const result = await login(normalizedEmail, normalizedPassword);
      if (!result.email_verified) {
        setError('メールアドレスの確認が完了していません。登録時に送信されたメールを確認してください。');
        setLoading(false);
        return;
      }
      router.replace('/');
    } catch (error: any) {
      console.error('[LoginScreen] Auth error:', error);
      console.error('[LoginScreen] Error type:', error?.constructor?.name);
      console.error('[LoginScreen] Error message:', error?.message);
      console.error('[LoginScreen] Error stack:', error?.stack);
      
      // セキュリティ上の理由から、どちらが間違っているかわからないメッセージに統一
      const errorMessage = error?.message || '認証に失敗しました';
      if (errorMessage.includes('メールアドレス') || errorMessage.includes('パスワード')) {
        setError('メールアドレスまたはパスワードが正しくありません');
      } else {
        setError(errorMessage);
      }
    } finally {
      console.log('[LoginScreen] Setting loading to false');
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/forgot-password');
  };

  return (
    <ScrollView 
      style={styles.scrollContainer} 
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={true}
      nestedScrollEnabled={true}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.title}>GenBGT</Text>

          <TextInput
            style={styles.input}
            placeholder="メールアドレス"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null); // 入力時にエラーをクリア
            }}
            onBlur={() => {
              // フォーカスが外れた時に値を正規化
              setEmail(email.trim());
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="パスワード"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError(null); // 入力時にエラーをクリア
              }}
              onBlur={() => {
                // フォーカスが外れた時に値を正規化（パスワードは先頭・末尾のスペースのみ削除）
                setPassword(password.trim());
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              {showPassword ? (
                <IconEye size={20} color="#37352f" />
              ) : (
                <IconEyeOff size={20} color="#37352f" />
              )}
            </TouchableOpacity>
          </View>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>ログイン</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={handleForgotPassword}
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>
              パスワードを忘れた場合
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => router.push('/register')}
            disabled={loading}
          >
            <Text style={styles.registerButtonText}>
              新規登録
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
    minHeight: '100%',
  },
  container: {
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: '#f5f5f5',
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  passwordToggle: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordButton: {
    marginTop: 8,
    padding: 8,
  },
  forgotPasswordText: {
    color: '#007AFF',
    textAlign: 'center',
    fontSize: 14,
  },
  registerButton: {
    marginTop: 8,
    padding: 8,
  },
  registerButtonText: {
    color: '#007AFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#d93025',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
});

