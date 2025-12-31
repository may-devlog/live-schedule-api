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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
// アイコンは絵文字を使用（フォントに依存しない）

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }

    try {
      setLoading(true);
      if (isLogin) {
        const result = await login(email.trim(), password);
        if (!result.email_verified) {
          Alert.alert(
            'メール確認が必要です',
            'メールアドレスの確認が完了していません。登録時に送信されたメールを確認してください。',
            [
              {
                text: 'OK',
                onPress: () => router.push('/verify-email'),
              },
            ]
          );
          return;
        }
        router.replace('/(tabs)');
      } else {
        console.log('[LoginScreen] Starting registration process...');
        try {
          await register(email.trim(), password);
          console.log('[LoginScreen] Registration completed successfully');
          
          // Web環境ではwindow.alertを使用
          if (Platform.OS === 'web') {
            const message = `${email.trim()} に確認メールを送信しました。\nメール内のリンクをクリックして本登録を完了してください。\n\n※開発環境では、バックエンドのコンソールにメール内容が表示されます。`;
            if (typeof window !== 'undefined') {
              window.alert(`仮登録が完了しました\n\n${message}`);
            }
            router.push('/verify-email');
          } else {
            Alert.alert(
              '仮登録が完了しました',
              `${email.trim()} に確認メールを送信しました。\nメール内のリンクをクリックして本登録を完了してください。\n\n※開発環境では、バックエンドのコンソールにメール内容が表示されます。`,
              [
                {
                  text: 'OK',
                  onPress: () => router.push('/verify-email'),
                },
              ]
            );
          }
        } catch (regError: any) {
          console.error('[LoginScreen] Registration error in handleSubmit:', regError);
          // エラーは外側のcatchで処理される
          throw regError;
        }
      }
    } catch (error: any) {
      console.error('[LoginScreen] Auth error:', error);
      console.error('[LoginScreen] Error type:', error?.constructor?.name);
      console.error('[LoginScreen] Error message:', error?.message);
      console.error('[LoginScreen] Error stack:', error?.stack);
      
      const errorMessage = error?.message || '認証に失敗しました';
      console.log('[LoginScreen] Showing error alert:', errorMessage);
      
      // Web環境ではwindow.alertを使用
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.alert(`エラー\n\n${errorMessage}`);
        }
      } else {
        Alert.alert('エラー', errorMessage);
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
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>
          {isLogin ? 'ログイン' : '新規登録'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
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
            onChangeText={setPassword}
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
            <Text style={{ fontSize: 20 }}>
              {showPassword ? '🙈' : '👁️'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isLogin ? 'ログイン' : '登録'}
            </Text>
          )}
        </TouchableOpacity>

        {isLogin && (
          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={handleForgotPassword}
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>
              パスワードを忘れた場合
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsLogin(!isLogin)}
          disabled={loading}
        >
          <Text style={styles.switchText}>
            {isLogin
              ? 'アカウントをお持ちでない方はこちら'
              : '既にアカウントをお持ちの方はこちら'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
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
  switchButton: {
    marginTop: 16,
    padding: 8,
  },
  switchText: {
    color: '#007AFF',
    textAlign: 'center',
    fontSize: 14,
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
});

