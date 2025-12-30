import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { API_BASE } from '../constants/api';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // URLパラメータにトークンがある場合は自動的に確認
    if (params.token) {
      handleVerify(params.token);
    }
  }, []);

  const handleVerify = async (token?: string) => {
    const verifyToken = token || params.token;
    if (!verifyToken) {
      Alert.alert('エラー', '確認トークンがありません');
      return;
    }

    try {
      setVerifying(true);
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Verification failed' }));
        throw new Error(errorData.error || 'メール確認に失敗しました');
      }

      const data = await res.json();
      setVerified(true);
      Alert.alert('確認完了', data.message || 'メールアドレスの確認が完了しました', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
    } catch (error: any) {
      Alert.alert('エラー', error.message || 'メール確認に失敗しました');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>メールアドレスの確認</Text>
        
        {verified ? (
          <View>
            <Text style={styles.message}>
              メールアドレスの確認が完了しました。
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.buttonText}>ログイン画面へ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.message}>
              登録時に送信されたメール内のリンクをクリックして、メールアドレスを確認してください。
            </Text>
            <Text style={styles.subMessage}>
              メールが届かない場合は、迷惑メールフォルダもご確認ください。
            </Text>
            {params.token && (
              <TouchableOpacity
                style={[styles.button, verifying && styles.buttonDisabled]}
                onPress={() => handleVerify()}
                disabled={verifying}
              >
                {verifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>確認する</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>戻る</Text>
            </TouchableOpacity>
          </View>
        )}
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
  content: {
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
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    lineHeight: 24,
  },
  subMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
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
});

