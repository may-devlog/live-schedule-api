import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { API_BASE } from '../constants/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(params.token || '');

  const handleRequestReset = async () => {
    console.log('[ForgotPassword] handleRequestReset called');
    console.log('[ForgotPassword] Email value:', email);
    console.log('[ForgotPassword] Email trimmed:', email.trim());
    
    if (!email.trim()) {
      console.log('[ForgotPassword] Email is empty');
      setError('メールアドレスを入力してください');
      return;
    }

    try {
      console.log('[ForgotPassword] Setting loading to true');
      setLoading(true);
      setError(null); // エラーをクリア
      
      const url = `${API_BASE}/auth/request-password-reset`;
      console.log('[ForgotPassword] Request URL:', url);
      console.log('[ForgotPassword] API_BASE:', API_BASE);
      console.log('[ForgotPassword] Request body:', JSON.stringify({ email: email.trim() }));
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      
      console.log('[ForgotPassword] Fetch completed');

      // レスポンスのステータスを確認
      const status = res.status;
      const isOk = res.ok;
      
      console.log('[ForgotPassword] Response status:', status);
      console.log('[ForgotPassword] Response ok:', isOk);
      console.log('[ForgotPassword] Response headers:', Object.fromEntries(res.headers.entries()));

      if (!isOk) {
        // エラーレスポンスの場合
        console.log('[ForgotPassword] Response is not OK, reading error text');
        let errorText = '';
        try {
          errorText = await res.text();
          console.error('[ForgotPassword] Error response text:', errorText);
        } catch (textError) {
          console.error('[ForgotPassword] Failed to read error text:', textError);
        }
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          console.error('[ForgotPassword] Failed to parse error JSON:', parseError);
          errorData = { error: `リセット要求に失敗しました (status: ${status})` };
        }
        
        console.error('[ForgotPassword] Error data:', errorData);
        
        // エラーメッセージを画面に表示（requestedをtrueにしない）
        const errorMessage = errorData.error || 'リセット要求に失敗しました';
        console.error('[ForgotPassword] Setting error message:', errorMessage);
        setError(errorMessage);
        setRequested(false); // 明示的にfalseに設定
        setLoading(false);
        return; // ここで処理を終了
      }

      // 成功レスポンスの場合
      console.log('[ForgotPassword] Response is OK, parsing JSON');
      const data = await res.json();
      console.log('[ForgotPassword] Success data:', data);
      
      // 成功時のみrequestedをtrueにする
      setRequested(true);
      Alert.alert('送信完了', data.message || 'パスワードリセット用のメールを送信しました');
    } catch (error: any) {
      console.error('[ForgotPassword] Exception caught:', error);
      console.error('[ForgotPassword] Error name:', error?.name);
      console.error('[ForgotPassword] Error message:', error?.message);
      console.error('[ForgotPassword] Error stack:', error?.stack);
      
      // ネットワークエラーの場合
      if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
        setError('ネットワークエラーが発生しました。サーバーに接続できません。');
      } else {
        setError(error?.message || 'リセット要求に失敗しました');
      }
    } finally {
      console.log('[ForgotPassword] Setting loading to false');
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken) {
      Alert.alert('エラー', 'リセットトークンがありません');
      return;
    }

    if (!newPassword.trim() || newPassword.length < 6) {
      Alert.alert('エラー', 'パスワードは6文字以上で入力してください');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('エラー', 'パスワードが一致しません');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Reset failed' }));
        throw new Error(errorData.error || 'パスワードリセットに失敗しました');
      }

      const data = await res.json();
      Alert.alert('完了', data.message || 'パスワードのリセットが完了しました', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
    } catch (error: any) {
      Alert.alert('エラー', error.message || 'パスワードリセットに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // トークンがある場合はパスワードリセット画面を表示
  if (resetToken) {
    return (
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.title}>パスワードをリセット</Text>

          <TextInput
            style={styles.input}
            placeholder="新しいパスワード"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="パスワード（確認）"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>パスワードをリセット</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // リセット要求画面
  if (requested) {
    return (
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.title}>メールを確認してください</Text>
          <Text style={styles.message}>
            パスワードリセット用のメールを送信しました。
            メール内のリンクをクリックしてパスワードをリセットしてください。
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

  // リセット要求フォーム
  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>パスワードを忘れた場合</Text>
        <Text style={styles.message}>
          登録済みのメールアドレスを入力してください。
          パスワードリセット用のリンクを送信します。
        </Text>

        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null); // 入力時にエラーをクリア
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => {
            console.log('[ForgotPassword] Button pressed');
            console.log('[ForgotPassword] Email:', email);
            console.log('[ForgotPassword] Loading:', loading);
            handleRequestReset();
          }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>リセット用メールを送信</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>戻る</Text>
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
  message: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
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

