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

export default function RegisterScreen() {
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

    // ユーザーIDのバリデーション
    if (shareId.length < 3 || shareId.length > 20) {
      setError('ユーザーIDは3文字以上20文字以下で入力してください');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(shareId)) {
      setError('ユーザーIDは英数字、ハイフン、アンダースコアのみ使用できます');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await register(email.trim(), password, shareId.trim());
      Alert.alert(
        '登録完了',
        '登録が完了しました。メールアドレス確認のメールを送信しました。メールを確認してください。',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login'),
          },
        ]
      );
    } catch (error: any) {
      console.error('[RegisterScreen] Registration error:', error);
      setError(error?.message || '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>新規登録</Text>

        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="ユーザーID（3-20文字、英数字・ハイフン・アンダースコア）"
          value={shareId}
          onChangeText={(text) => {
            setShareId(text);
            setError(null);
          }}
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
              setError(null);
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
            <Text style={{ fontSize: 20 }}>
              {showPassword ? '🙈' : '👁️'}
            </Text>
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
            <Text style={styles.buttonText}>登録</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={styles.backButtonText}>
            ログイン画面に戻る
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
  backButton: {
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
    color: '#007AFF',
    textAlign: 'center',
    fontSize: 14,
  },
  errorText: {
    color: '#d93025',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
});

